# CLAUDE.md - atom/

Atom utility library (`@steem-monsters/atom`). See root CLAUDE.md for monorepo context.

## Architecture

Clojure-inspired atom: a mutable reference to an immutable value. All state is stored externally in module-level dictionaries keyed by `$$id` (see `internal-state.ts`), NOT on the Atom instance itself. The Atom object is just an opaque handle.

## API (all free functions, not methods)

- `Atom.of(state, { validator? })` - sole constructor (private `new`)
- `deref(atom)` - read state (returns `DeepImmutable<S>`)
- `set(atom, nextState)` - replace state
- `swap(atom, updateFn)` - apply pure function to current state
- `addChangeHandler(atom, key, handler)` / `removeChangeHandler(atom, key)` - observe changes; key must be unique per atom (throws if duplicate)
- `setValidator(atom, validatorFn)` - replace validator; rejects if current state fails new validator
- `getValidator(atom)` - retrieve current validator
- `dispose(atom)` - clean up all internal state for the atom

## Key non-obvious details

- **State is external**: The three module-level dictionaries (`stateByAtomId`, `validatorByAtomId`, `changeHandlersByAtomId`) hold all data. This means disposed atoms leave no trace but also cannot be used after disposal.
- **Validator runs on construction**: Invalid initial state throws `AtomInvalidStateError`.
- **Change handlers fire on both `set` and `swap`**: Handlers receive `{ previous, current }`. Symbol keys and string keys are both supported, iterated separately (symbols first via `getOwnPropertySymbols`, then string keys via `Object.keys`).
- **DeepImmutable types**: `deref` returns a deeply readonly type. The runtime does NOT enforce immutability (no `Object.freeze`); it is type-level only.
- **Error name**: All validation failures use `err.name = 'AtomInvalidStateError'`.
