# Scope

## In-scope files and dirs

- `src/vendure-config.ts` / `src/vendure-config.js` — main Vendure app configuration
- `src/index.ts` — server bootstrap (`bootstrapWorker`, `bootstrap`)
- `src/worker.ts` — worker process bootstrap
- `src/plugins/**` — app-level plugin wiring (local or imported)
- `src/migrations/**` — TypeORM migration files for the app DB
- `src/email/**` — email plugin templates and handlers
- `.env`, `.env.*` — DB connection strings, auth secrets, plugin API keys
- `docker-compose.yml` — local service dependencies (Postgres, Redis, Elasticsearch)

## Stack boundaries

- Vendure 3 app layer: plugin registration, DB config, job queue, asset storage
- Worker: background job handlers, email processing, search indexing
- Not in scope: isolated shared plugin package code (use vendure-plugin-patterns)
- Not in scope: storefront/admin UI React components

## Triggers

- Adding or removing a plugin from `VendureConfig.plugins`
- Changing DB connection config or entity schema requiring migration
- Adding or changing job queue strategy (in-memory, BullMQ, Redis)
- Changing asset storage strategy (local, S3, GCS)
- Adding or modifying email handler or template
- Changing worker-only vs server+worker plugin config split
- Adding environment variable consumed by app bootstrap
