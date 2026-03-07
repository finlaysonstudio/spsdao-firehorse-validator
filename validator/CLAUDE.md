# CLAUDE.md - validator/

Core validator library (`@steem-monsters/splinterlands-validator`). See root `CLAUDE.md` for monorepo structure, build/test commands, Docker ops, and environment configuration.

## Public API Surface

`src/lib.ts` is the barrel export. Everything consumed by other packages in this monorepo or externally must be exported from here. If you add a new public type/class, add it to `lib.ts`.

## DI Pattern (Symbol-as-Type-and-Token)

This codebase uses a **manual DI pattern** where a symbol and a TypeScript type share the same name. The actual container is tsyringe (used in consuming packages), but this library only defines the contracts.

```ts
// This is THE pattern. Both the type and the injection token share one name.
export type ValidatorWatch = Watcher<'validator', ValidatorConfig>;
export const ValidatorWatch: unique symbol = Symbol('ValidatorWatch');
```

- `InjectionToken<T>` is `constructor<T> | string | symbol` (see `src/utilities/dependency-injection.ts`)
- `Resolver` resolves tokens; `Container` registers providers. Both are also DI tokens themselves.
- When you see `req.resolver.resolve(SomeClass)` in API routes or `resolve<SomeType>(SomeSymbol)` elsewhere, that is this pattern in action.
- Key tokens to know: `Handle`, `KnexToken`, `TopActionRouter`, `VirtualActionRouter`, `ValidatorWatch`, `TokenWatch`, `PoolWatch`, `ShopWatch`, `ConfigLoader`, `PrefixOpts`, `ValidatorOpts`, `EntryOptions`, `ApiOptions`, `WrappedTokenSupport`, `TopLevelVirtualPayloadSource`, `Middleware`, `ConditionalApiActivator`, `StakingConfiguration`, `AdminMembership`, `PoolUpdater`, `ValidatorUpdater`

## Action System

### Hierarchy
- `IAction` - interface with `execute(trx?)`, `isSupported()`, `isEmpty()`
- `Action<T extends AnyObjectSchema>` - abstract base. Constructor takes a `Schema<T>`, validates with yup. Subclasses implement `validate(trx?)` and `process(trx?) -> EventLog[]`
- `AdminAction<T>` - extends `Action`, auto-validates that `op.account` is an admin via `AdminMembership`
- `TestAction` - concrete reference implementation

### Action Lifecycle
1. Hive block arrives with `custom_json` operations
2. `BlockProcessor.process()` filters for validator operations by prefix (`PrefixOpts.custom_json_prefix`)
3. `OperationFactory` builds `Operation` instances, which parse JSON and call `ActionOrBust.createAction()`
4. `ActionOrBust` uses `LookupWrapper` to find the correct `ActionFactory` by action name and block number
5. The factory's `build()` constructs the action (yup validation happens in constructor -- failure throws, returning `null` from `createAction`)
6. `action.execute(trx)` calls `validate()` then `process()`. `ValidationError` is caught and recorded (not re-thrown). Other errors propagate and kill the block.

### Virtual vs Real Actions
- Real actions come from Hive blockchain `custom_json` operations
- Virtual actions are generated internally per block (e.g., unstaking milestones). `VirtualPayloadSource` produces `ProcessResult[]` shaped like custom_json tuples
- `TopLevelVirtualPayloadSource` wraps multiple sources. Virtual ops are processed BEFORE real ops in `BlockProcessor.process()`
- Two separate routers: `TopActionRouter` (real) and `VirtualActionRouter` (virtual), both are DI symbols

### Routing
- `ActionRouter` extends `PrecomputedRouter` -- routes are action-name-to-factory mappings with optional block range constraints
- Routes can have `from_block`/`to_block` that are static numbers or functions of `ValidatorConfig` (dynamic, recomputed on config change)
- `LookupWrapper` subscribes to `ValidatorWatch` and recomputes both routers when config changes
- `@route(name, blockRangeOpts)` decorator on properties/methods, with `addRoutesForClass()` to wire up (NOTE: `@autoroute` class decorator is broken per its own docs -- use `addRoutesForClass` instead)
- `MultiActionRouter` merges multiple `PrecomputedRouter` instances

## Entity / Repository Pattern

- Entities are defined in `src/db/tables.ts` using `@wwwouter/typed-knex` decorators (`@Table`, `@Column`)
- `BaseRepository` wraps `Handle` (which is `TypedKnex` + raw `Knex`). Use `this.query(EntityClass, trx)` for typed queries, `this.queryRaw(trx)` for raw knex
- Repositories live under `src/entities/` alongside their domain logic, NOT in `src/repositories/` (that dir only has `TransactionRepository_` which is a read-only query layer)
- Numeric columns stored as strings in Postgres (NUMERIC type) -- repositories parse to `number` with `parseFloat()` in static `into()` methods
- `bigserial`/`bigint` columns (typeId 20) are parsed to `BigInt` via `src/db/config/mapping.ts`
- System accounts follow the pattern `$UPPER_SNAKE_CASE` (e.g. `$TOKEN_STAKING`). Validated by `isSystemAccount()`. Hive accounts are validated by dhive's `validateAccountName`.

## Database / Transaction Patterns

- PostgreSQL via knex. Connection configured through `KnexOptions` (`freshKnex()`)
- `TransactionStarter.withTransaction(callback)` handles commit/rollback
- `TransactionMode.Default` = standard read/write. `TransactionMode.Reporting` = `REPEATABLE READ READ ONLY` (used by all API routes)
- `Trx` extends `Knex.Transaction` with optional `mode` and `readOnly` properties
- All API route handlers wrap DB access in `TransactionMode.Reporting` transactions
- Almost every repository method accepts an optional `trx?: Trx` parameter -- pass it through consistently

## Config System

- Config lives in a `config` database table with `group_name`, `name`, `value`, `value_type`
- `ConfigRepository` loads/parses all config into a flat object with groups as nested objects/arrays
- `ConfigLoader` interface wraps ConfigRepository with watchers. `load()` reads from DB, parsed config is available on `.value`
- Typed config groups: `ValidatorConfig`, `TokenConfig`, `ShopConfig`, `BookkeepingConfig`
- Each config group has a yup schema and a `Watcher<name, type>` pattern that supports `addXxxWatcher`/`removeXxxWatcher` methods
- Config changes propagate reactively via watchers (e.g., `ValidatorWatch` triggers router recomputation)

## Cache / Snapshot System

- `Cache<Structure, Data>` is an immutable-state wrapper using `@steem-monsters/atom`. Subclass and implement `updateImpl`, `reloadImpl`, `clearImpl`
- `LockstepCache<T>` maintains a `transient` and `canonical` copy. `commit()` copies transient to canonical, `rollback()` copies canonical back to transient. This is how in-memory state survives or reverts with block processing.
- `Snapshot<T>` orchestrates multiple `Injectable & AtomicState` objects, calling `commit()`/`rollback()` on all of them together
- In `EntryPoint.streamBlocks()`: success -> `snap.commit()`, error -> `snap.rollback()` + `socket.clearDelayed()`

## Entry Point Lifecycle

1. `EntryPoint` is constructed with all dependencies (not self-wiring)
2. `preflightCheck()` -- validates DB tables exist, primes caches (`Primer`), connects socket, commits initial snapshot
3. `start()` -- begins streaming blocks from Hive, enables API
4. Block loop: stream block -> process (virtual ops, then real ops, within a DB transaction) -> commit snapshot -> dispatch plugins -> repeat
5. On error: rollback snapshot, clear socket, re-throw (exits process)

## Plugin System

- `Plugin` interface: optional `beforeBlockProcessed(blockNum)` and `onBlockProcessed(blockNum, eventLogs, blockHash, headBlockNum)` -- both async
- `PluginDispatcherBuilder.create().addPlugin(p).build()` -> `PluginDispatcher`
- Plugins fire-and-forget (errors are logged, not propagated). They run AFTER snapshot commit.
- `SimpleLogPlugin` is the only built-in plugin

## Synchronisation

- `SynchronisationPoint<T>` -- async barrier called before each block is processed
- `CollectedSynchronisationPoint` chains multiple points in order
- `SynchronisationClosure` closes over config, calling `waitToProcessBlock(block_num)` with derived config args
- Used to coordinate with external systems (e.g., waiting for another chain's block)

## Testing

- Jest with ts-jest. Config in `jest.config.js`
- `setupFiles: ['@abraham/reflection']` -- required for typed-knex decorator metadata
- Tests are colocated: `foo.ts` / `foo.test.ts` in the same directory
- Unit-level only, no DB. Tests pure logic: cache behavior, routing, schema validation, config parsing
- No test helpers or fixtures in this package -- see root `CLAUDE.md` for integration test infrastructure in `apps/sps-validator`

## Key Architectural Concerns

- **Determinism is critical**: all validators must produce identical state for the same blocks. Block hashes are computed from transaction results. Non-deterministic code breaks consensus.
- **`Bookkeeping` accounts** (configured via `BookkeepingConfig.accounts`) are "printing press" accounts that can send tokens without having a balance -- they are the money supply source.
- **Block reward calculation** has two modes: `per_block` (decreasing over time) and `per_block_capped` (dynamic based on reward pool balance).
- **`EventLog`** is the standard return type from action processing. It captures table name + data + event type (INSERT/UPDATE/DELETE). Used for plugin dispatch and websocket notifications.
- **Posting auth vs active auth**: `posting_auth_actions` whitelist in `src/entities/operation.ts` determines which actions can use posting authority. Anything not listed requires active auth.
