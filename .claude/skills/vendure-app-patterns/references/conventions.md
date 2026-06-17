## Naming conventions

- App server entry: `src/index.ts`; worker entry: `src/worker.ts`
- Vendure config: `src/vendure-config.ts` exporting `config` of type `VendureConfig`
- Migration files: TypeORM auto-generated names (`src/migrations/TIMESTAMP-Description.ts`)
- Plugin directory: `src/plugins/<plugin-name>/` containing `<plugin-name>.plugin.ts`
- Env var consumption: via `process.env.VAR_NAME` at config level only; referenced in `.env.example`

## Do / don't

DO: Order plugins in `VendureConfig.plugins` so dependencies come before dependents — DON'T: register plugins in arbitrary order (initialization order matters)
DO: Add every new env var to `.env.example` with a descriptive comment — DON'T: consume an env var in config without a corresponding `.env.example` entry
DO: Generate a new TypeORM migration for every schema change — DON'T: edit existing migration files (they may have already run in production)
DO: Test both server and worker bootstrap after any plugin or config change — DON'T: only verify server starts without checking worker
DO: Keep `src/vendure-config.ts` free of business logic — DON'T: add conditional logic or data transformations to the config file
DO: Import from `@vendure/core` public API only — DON'T: import from `@vendure/core/dist/...` internal paths (subject to breaking changes)

## Forbidden patterns

NEVER: Plugin registered in config without its required env var present in `.env.example` — environment setup will silently fail
NEVER: Schema change deployed without a corresponding migration — production DB diverges from entity definitions
NEVER: Destructive migration without a data migration or archival plan — data loss in production
NEVER: Import from `@vendure/core` internal `dist/` paths — internal API is not stable
NEVER: Worker-only plugin registered in the server bootstrap (or vice versa) — causes initialization errors
NEVER: Hard-coded database credentials in `src/vendure-config.ts` — use environment variables
