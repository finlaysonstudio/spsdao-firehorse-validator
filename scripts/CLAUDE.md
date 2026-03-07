# CLAUDE.md - scripts/

Utility scripts. See root CLAUDE.md for monorepo context.

## Scripts

### Fork Detection

- **check_fork.js** — Compares transaction and block data between two validator nodes (localhost:3333 vs QA) block-by-block to detect forks. Accepts optional start block as CLI arg. Polls continuously, exits non-zero on mismatch.
- **check_hive_block_ids.js** — Compares block IDs between the production validator API and Hive blockchain nodes (via `splinterlands-dhive-sl`). Logs mismatches to `fork_blocks.csv`. Persists progress in `last_checked_block.txt` so it resumes across runs.
- **fork_blocks.csv** — Output artifact from `check_hive_block_ids.js`. Contains detected block ID mismatches.
- **last_checked_block.txt** — Checkpoint file for `check_hive_block_ids.js`.

### Database Schema & Snapshots

- **validator_schema.sql** — Schema-only pg_dump of the public schema used for tests (`apps/sps-validator/src/__tests__/structure.sql` is the test copy). Defines all core tables: balances, blocks, config, validators, delegations, NFTs, staking, transactions, votes.
- **create-structural-dump.sh** — Runs `pg_dump --schema-only` excluding snapshot/sqitch/partman schemas and partitioned/temp tables. Strips `CREATE EXTENSION` lines. Output goes to stdout. Uses env vars `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_DB`.
- **create-snapshot.sh** — Interactive. Calls `snapshot.freshsnapshot()` stored procedure, then does a data-only pg_dump of the snapshot schema. Embeds the latest sqitch change ID as a comment header. Optionally zips output.
- **new_db_config.sql** — Seed data (UTF-16 encoded) with INSERT statements for `config` table: validator settings, SPS staking rewards params, admin/proxy accounts.
- **db_restore.sql** — Cleanup SQL for stripping a production database down to SPS validator essentials. Drops game-specific tables/schemas (battles, cards, guilds, etc.), removes non-SPS/SPSP balances, prunes config to `$root` and `sps` groups only.

### CI / Migration

- **ci-regenerate-structure.sh** — Spins up Postgres via docker-compose, runs sqitch migrations in a container on the `validator:postgres` network, then dumps structure via `npm run dump-structure`. Env vars: `POSTGRES_PASSWORD`, `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_SCHEMA`, `DOCKER_COMPOSE_NETWORK`.
- **ci-lazy-regenerate-structure.sh** — Make-based wrapper around `ci-regenerate-structure.sh`. Only regenerates `structure.sql` if any sqitch migration file is newer than the existing output.

### Sqitch Prebake

- **prebake.sh** — Converts sqitch deploy/verify scripts into numbered plain SQL files. Requires GNU tools (cut, bc, bash v4+, getopt, awk, sed) and sqitch. Supports `--set VAR=VAL` for template variable substitution. Passthrough args go to `sqitch bundle`. Output: `{PREFIX}_{NNN}_{migration}_{deploy|verify}.sql` files in `--dest-dir`.
