# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SPS Validator - a Splinterlands DAO validator node that processes Hive blockchain blocks, manages SPS token operations (staking, delegation, unstaking, burning), validator voting, pool rewards, and a shop system. Runs against a PostgreSQL database with Docker for production and testcontainers for testing.

## Monorepo Structure (Nx)

- **`validator/`** - Core library (`@steem-monsters/splinterlands-validator`). Block processing engine, action system, API, DI container, entities, and utilities. This is where most business logic lives.
- **`monad/`** - Functional monad library (`@steem-monsters/lib-monad`).
- **`atom/`** - Atom library (`@steem-monsters/atom`).
- **`apps/sps-validator/`** - Main application. SPS-specific composition root, actions, config, and entry point. Uses tsyringe for DI.
- **`apps/sps-validator-ui/`** - React management UI (Vite, Tailwind).
- **`apps/bridges/`** - Bridge application.
- **`sqitch/`** - Database migrations (sqitch).

Path aliases in `tsconfig.base.json` map `@steem-monsters/*` to local library source.

## Common Commands

```bash
# Install dependencies
npm i

# Build a project (builds dependencies first via nx)
npm run build sps-validator

# Run the validator locally (needs postgres running)
npm start sps-validator

# Run validator in debug/dev mode
npm run validator:debug

# Lint
npm run lint sps-validator

# Run all tests for a project (uses testcontainers - needs Docker running)
npm test sps-validator

# Run a single test file
npx nx test sps-validator -- --testPathPattern="delegate_tokens"

# Run tests in the validator library
npm test validator-lib

# Dump DB structure for tests (needs pg_dump v16, POSTGRES_DB env var)
POSTGRES_DB=validator npm run dump-structure
```

## Testing

Tests use **Jest** with **testcontainers** (PostgreSQL 16 Alpine). Docker must be running. On first run, a reusable postgres container starts and loads `structure.sql` as a template DB. Individual tests clone from this template.

Key test infrastructure in `apps/sps-validator/src/__tests__/`:
- `fixture.ts` - Test fixture with DI container setup
- `fake-db.ts` - In-memory DB helpers
- `action-fixture.ts` - Action testing helpers
- `process-op.ts` - Operation processing helpers

Test files are colocated with source (e.g., `delegate_tokens.test.ts` next to `delegate_tokens.ts`).

## Architecture

### Action System
Actions are the core unit of work. Each action (token transfer, stake, delegate, etc.) is a class in `apps/sps-validator/src/sps/actions/`. Actions are registered via routers (`RouterImpl`, `VirtualRouterImpl`) and dispatched by the block processor.

### Composition Root
`apps/sps-validator/src/sps/composition-root.ts` wires everything together using tsyringe DI. The validator library defines abstract tokens; the sps-validator app provides concrete implementations prefixed with `Sps` (e.g., `SpsBalanceRepository`, `SpsBlockProcessor`).

### Block Processing Pipeline
`EntryPoint` -> `BlockProcessor` -> `OperationFactory` -> `ActionRouter` -> individual actions. Virtual actions (automated/scheduled) use `VirtualPayloadSource`.

### Configuration
Uses **convict** for environment variable management. See `.env-example` for all available settings. Key env vars: `DB`, `VALIDATOR_ACCOUNT`, `VALIDATOR_KEY`, `CUSTOM_JSON_PREFIX`, `CUSTOM_JSON_ID`.

## Docker Operations

```bash
./run.sh start          # Start DB + validator
./run.sh start all      # Start DB + validator + UI
./run.sh stop           # Stop everything
./run.sh build          # Build containers, run migrations, download snapshot
./run.sh logs           # Tail logs
./run.sh rebuild_service validator  # Rebuild after env changes
./run.sh psql -c "SELECT ..."      # Query the DB
```

## Node Version

Node v23.3.0 (see `.nvmrc`)
