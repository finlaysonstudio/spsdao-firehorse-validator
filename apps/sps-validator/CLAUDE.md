# CLAUDE.md - apps/sps-validator/

SPS Validator application. See root CLAUDE.md for monorepo context, build/test/Docker commands, and app-vs-library boundary. See `validator/CLAUDE.md` for core library patterns.

## Composition Root (`src/sps/composition-root.ts`)

- Uses tsyringe DI. The validator library defines abstract tokens (e.g., `BalanceRepository`, `BlockProcessor`, `EntryPoint`); this app binds them to concrete `Sps*` implementations.
- Pattern: `container.register<AbstractToken>(AbstractToken, { useToken: SpsConcreteClass })`.
- Config options tokens (e.g., `BurnOpts`, `MissedBlocksOpts`, `SupplyOpts`) are registered via `{ useToken: ConfigType }` -- convict config object duck-types to multiple option interfaces.
- `CompositionRoot` is a static-only class (`extends null`) that runs all registrations in a static block.
- `CompositionRoot.replace()` is a hack for swapping registrations in tests (reaches into tsyringe internals).
- `CompositionRoot.assertValidRegistry()` catches circular module dependency bugs where an imported token is `undefined` at runtime.
- The test composition root (`src/__tests__/test-composition-root.ts`) overrides specific registrations (Knex, Middleware, external chain repos, ValidatorShop) on top of the production root.

## Adding a New Action

1. **Define schema** in `src/sps/actions/schema.ts` -- create a `new Schema.Schema('action_name', yupObject)`.
2. **Create action class** extending `Action<typeof schema.actionSchema>`. Constructor signature must be `(op, data, index, ...dependencies)`. Implement `validate(trx)` and `process(trx)` returning `EventLog[]`. Optionally override `isSupported()`.
3. **Create factory and router** at the bottom of the action file:
   ```typescript
   const Builder = MakeActionFactory(MyAction, Dep1, Dep2);
   export const Router = MakeRouter('action_name', Builder);
   ```
   `MakeActionFactory` and `MakeRouter` (from `src/sps/actions/utils.ts`) eliminate boilerplate for DI wiring. The factory injects dependencies positionally matching the action constructor after `(op, data, index)`.
4. **Register the router** in `src/sps/actions/index.ts`:
   - User-initiated actions: add to `RouterImpl = MakeMultiRouter(...)`.
   - Virtual/automated actions: add to `VirtualRouterImpl = MakeMultiRouter(...)`.
5. **For virtual actions**, also create a `VirtualPayloadSource` implementation and add it to the `VirtualPayloadSource = MakeVirtualPayloadSource(...)` call.

## Virtual vs. User Actions

- **User actions** (RouterImpl): triggered by Hive custom_json transactions from real users (e.g., `token_transfer`, `stake_tokens`).
- **Virtual actions** (VirtualRouterImpl): system-generated per-block operations (e.g., `token_unstaking`, `claim_pool`, `burn`, `expire_promises`, `update_missed_blocks`). Each has a `VirtualPayloadSource` that produces payloads for the block being processed.

## Token System

- Tokens defined in `src/sps/features/tokens/supported-tokens.ts` (TOKENS constant and SUPPORTED_TOKENS config).
- `SUPPORTED_TOKENS` declares transferability, staking relationships (`stakes`/`unstakes`), delegation tokens (`in_token`/`out_token`), and precision.
- Actions check `TokenSupport.canTransfer(SUPPORTED_TOKENS, token, qty)` in `isSupported()` to silently ignore unsupported tokens.
- Virtual tokens (`src/sps/features/tokens/virtual-tokens.ts`) are aggregates of real tokens (e.g., `SPS_TOTAL = SPS + SPSP`).

## Configuration

### Convict Config (`src/sps/convict-config.ts`)
- `ConfigType` is both a TypeScript type and a DI token (unique symbol). The convict schema defines all env vars.
- Custom formats: `stringy-array` (comma-separated string to array), `stringy-object` (JSON string to object), `maybe-number` (nullable number).
- The exported `cfg` object is registered in the DI container and duck-typed to multiple option interfaces (`PrefixOpts`, `HiveOptions`, `BurnOpts`, etc.).

### Runtime Config (`src/sps/config.ts` - SpsConfigLoader)
- Loads configuration from the `config` database table at startup and watches for changes.
- Implements many "watch" interfaces (`ValidatorWatch`, `TokenWatch`, `PoolWatch`, etc.) -- this single class is the source of truth for all runtime config.
- Uses `Quark` watchers to validate and parse config groups (`sps`, `validator`, `shop`, etc.) via yup schemas whenever config changes.
- `SpsConfigLoader.DEFAULT` provides test defaults for all config groups.

## Transition System (`src/sps/features/transition/`)

- One-time block-number-triggered changes (hard forks). Transition points defined in convict config under `transition_points`.
- `TransitionManager.isTransitioned(name, block_num)` checks if current block is at or past a transition.
- `TransitionManager.isTransitionPoint(name, block_num)` checks exact block match (for emitting virtual ops).
- Actions in `src/sps/actions/transitions/` handle the actual transition logic.
- To add a new transition: add to convict config, add to `TransitionPointDescriptions`, create a transition action, wire it into `TransitionManager.process()`.

## Test Infrastructure

### DB Setup
- `jest.global-setup.ts` -> `jest.global-db.ts`: starts a reusable PostgreSQL 16 testcontainer, loads `src/__tests__/structure.sql` as a template DB.
- Each test gets a fresh DB cloned from the template via `CREATE DATABASE ... TEMPLATE`.
- `FreshDatabase` (fake-db.ts) manages per-test DB lifecycle using Knex proxies that defer until `restore()` is called.

### Test Pattern
```typescript
import { container } from '../../../__tests__/test-composition-root';
import { Fixture } from '../../../__tests__/action-fixture';

const fixture = container.resolve(Fixture);

beforeAll(() => fixture.init());
beforeEach(async () => {
    await fixture.restore();    // fresh DB clone
    await fixture.loader.load(); // load config from DB
});
afterAll(() => fixture.dispose());

test.dbOnly('description', async () => {
    await fixture.testHelper.setDummyToken('account', 100);
    await fixture.opsHelper.processOp('action_name', 'account', { payload });
    const result = await fixture.testHelper.getDummyToken('account');
    expect(result?.balance).toBe(90);
});
```

### Key Test Utilities
- `test.dbOnly` -- custom Jest binding (defined in `jest.setup.ts`) that skips if DB is unavailable.
- `Fixture` (action-fixture.ts) extends base `Fixture` with `loader` (SpsConfigLoader) and `cfg` (ConfigType).
- `TestHelper` (db-helpers.ts) -- convenience methods for inserting test data (tokens, validators, votes, blocks, config, etc.).
- `OpsHelper` (process-op.ts) -- `processOp(method, username, payload, opts?)` simulates a Hive custom_json operation. `processVirtualOp(...)` for virtual ops.

## Plugins

- Plugins implement the `Plugin` interface (from validator lib) with lifecycle hooks like `beforeBlockProcessed()`.
- Registered via `PluginDispatcherBuilder` in the composition root. Each plugin has a static `isAvailable()` guard.
- `KillPlugin`: stops the process at a configured block number (env `KILL_BLOCK`). Used for controlled replay stops.
- `ValidatorCheckInPlugin`: periodic validator check-in broadcasts.
- `PriceFeedPlugin`: broadcasts external price feed data.

## Entities

- Entity classes in `src/sps/entities/` are `@injectable()` tsyringe singletons implementing repository interfaces from the core library.
- Pattern: `Sps*Repository extends SomeBaseRepository` with `@inject(Handle)` for DB access.
- `src/sps/entities/tables.ts` defines additional DB entity types (e.g., `ValidatorCheckInEntity`) beyond what the core lib provides.
