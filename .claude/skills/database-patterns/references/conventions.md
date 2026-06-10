## Naming conventions

- Migration files: `YYYYMMDDHHMMSS_describe_change.ts` / `YYYYMMDDHHMMSS_describe_change.php` (timestamp prefix, snake_case description)
- Entity/model classes: singular PascalCase — `Order`, `ProductVariant`, `UserProfile` (never `Orders`, `Products`)
- Repository methods: `findByX`, `findOneByX`, `findAllByX` — consistent `find` prefix for read operations
- Relation properties: camelCase matching the related entity — `order.lineItems`, `user.roles`
- Index names: `idx_table_column` or `idx_table_col1_col2` for composite indexes
- Constraint names: `uq_table_column` for unique, `fk_table_ref_table` for foreign keys

## Do / don't

DO: Every migration must have a `down()` / `revert()` method that fully undoes the `up()` — DON'T: create migration without rollback path
DO: Add index before writing queries that depend on it — DON'T: deploy query with WHERE/JOIN on unindexed column and add index later
DO: Run `EXPLAIN ANALYZE` on new queries against production-representative data volumes — DON'T: ship queries verified only on empty dev DB
DO: Use parameterized queries / ORM query builders for all user-supplied values — DON'T: concatenate user input into SQL strings
DO: Add or update FK index explicitly in migration — DON'T: rely on ORM to silently create FK indexes (not all do)
DO: Rename columns as three-step migration (add new → backfill → drop old) — DON'T: rename column in single migration (breaks readers mid-deploy)
DO: Keep raw SQL confined to repository/data-access layer — DON'T: write raw SQL in service or controller layer
DO: Run migrations in CI against a real DB engine matching production — DON'T: test migrations only against SQLite when production is PostgreSQL/MySQL

## Forbidden patterns

NEVER: Migration without index for a new foreign key column — FK scans without index cause full table scans
NEVER: `SELECT *` in production query — schema changes break callers silently
NEVER: `findOne` result used without null check — causes null-dereference errors
NEVER: Drop column without a preceding data migration or archival step — data loss risk
NEVER: Alter column type in a single migration on a live table — requires zero-downtime strategy
NEVER: Unbounded query (no `LIMIT`) on a table that can grow to millions of rows — OOM or timeout risk
NEVER: Shared mutable state between migration files — migration ordering must be safe in any parallel run
