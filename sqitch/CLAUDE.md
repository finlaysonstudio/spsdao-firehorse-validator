# CLAUDE.md - sqitch/

Database migrations (sqitch). See root CLAUDE.md for monorepo context.

## Engine

PostgreSQL. Config in `sqitch.conf`. Verify runs automatically on deploy and rebase.

## Two Sqitch Plans

- **`sqitch.plan`** - Main schema migrations (tables, functions, indexes). This is the default target.
- **`sqitch-data.plan`** - Single `snapshot` change that loads a snapshot SQL file into the database. Deployed as a separate sqitch target (`sqitch-data`).

## Migration Triplets

Each change has three files with the same name:
- `deploy/<name>.sql` - Forward migration (wrapped in BEGIN/COMMIT)
- `revert/<name>.sql` - Rollback migration
- `verify/<name>.sql` - Column-existence checks via `SELECT ... WHERE FALSE` patterns, wrapped in BEGIN/ROLLBACK

## psql Variables (Not Placeholders)

Migrations use psql `:variable` syntax, NOT sqitch `%{placeholder}` syntax. Key variables passed via `--set` at deploy time:
- `:APP_SCHEMA` - The application schema name (e.g., `validator`)
- `:APP_USER` - The database role to grant permissions to
- `:DB_BLOCK_RETENTION` - Retention policy for partitioned tables
- `:snapshot_file` - Path to snapshot SQL, used by `\i :snapshot_file` in `deploy/snapshot.sql`

## Three-Phase Staggered Deploy

`staggered-deploy.sh` runs sqitch deploy three times in sequence:
1. **Schema up to `pre-snapshot`** - Creates tables/functions needed before snapshot restore
2. **Snapshot data load** - Deploys the `sqitch-data` target, which executes `snapshot.pre_snapshot_restore()`, loads the snapshot SQL via `\i`, then calls `snapshot.post_snapshot_restore()`
3. **Remaining schema changes** - Applies any migrations that come after `pre-snapshot` in the plan

The snapshot SQL file embeds a `-- to_change:<name>` comment that tells `staggered-deploy.sh` which plan entry to deploy up to in phase 1. If absent, defaults to `pre-snapshot`.

## Snapshot System

Two schemas work together:
- **`snapshot`** schema - Staging area. `snapshot-tables` creates empty clones of app tables here. Snapshot SQL files insert directly into these tables.
- **App schema** (`:APP_SCHEMA`) - Live data. `post_snapshot_restore()` moves data from `snapshot.*` into app tables, then truncates the staging tables.

`snapshot-function.sql` defines `snapshot.freshsnapshot()` for *creating* snapshots (copying app data into snapshot schema). It has an `p_archive_flag` parameter: when false, it prunes historical/transactional data to minimize snapshot size.

## Table Partitioning

`partitions.sql` converts `blocks`, `validator_transactions`, and `validator_transaction_players` to range-partitioned tables (by `block_num`, interval 432000). Uses `pg_partman`. The migration pattern: copy to temp table, drop original, recreate as partitioned, copy data back. `post-snapshot-restore-partition-prep.sql` handles partition creation during snapshot restore (before data is inserted).

## Docker Entrypoint Flow

`docker-entrypoint.sh` orchestrates full DB setup:
1. `extract-snapshot.sh` - Unzips snapshot (from local file or HTTP URL) to `$SNAPSHOT`
2. `init-db.sh` - Creates DB role, database, and grants
3. `staggered-deploy.sh` - Runs the three-phase deploy

## Naming

Migration names use kebab-case. No version prefixes or numeric ordering; ordering is defined solely by `sqitch.plan`. Dependencies declared in the plan file with `[dep1 dep2]` syntax.

## Non-Obvious Details

- `pre-snapshot.sql` is a no-op (empty BEGIN/COMMIT). It exists purely as a synchronization point in the plan for staggered deploy to split on.
- `verify/reward_delegations.sql` exists but has no corresponding deploy/revert (orphaned file).
- Snapshot tables in the `snapshot` schema are created with `AS TABLE ... WITH NO DATA` (structure-only clones), so they must be kept in sync with app schema changes manually.
- Serial-keyed tables (`promise`, `promise_history`) need sequence resets after snapshot restore -- handled in `post_snapshot_restore()`.
