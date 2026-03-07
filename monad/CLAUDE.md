# CLAUDE.md - monad/

Monad utility library (`@steem-monsters/lib-monad`). See root CLAUDE.md for monorepo context.

## What This Is

A Rust-style `Result<T, E>` type for TypeScript. Discriminated union on `.status` (`'ok'` | `'err'`), not class-based.

## API

All exports come from `src/result.ts` via `src/lib.ts`.

- `Result.Ok(value)` / `Result.OkVoid()` / `Result.Err(error)` — constructors
- `Result.isOk(result)` / `Result.isErr(result)` — type guards (narrows to `Ok<T>` or `Err<E>`)
- Access `.value` on `Ok`, `.error` on `Err`

## Key Detail

`Result` is both a type (`Result<T, E>`) and a const object (namespace pattern). Import the single name for both.
