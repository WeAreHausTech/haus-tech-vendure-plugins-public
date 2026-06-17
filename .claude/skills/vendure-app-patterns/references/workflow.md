# Workflow

## Implementation steps

1. Open `src/vendure-config.ts` — plugin order matters; place plugins that depend on others after
2. For new plugin: import and add to `plugins` array; provide required config options from env
3. For schema changes: generate TypeORM migration after entity change; never edit existing migrations
4. For worker-only plugins: add to `src/worker.ts` bootstrap; confirm not duplicated in `src/index.ts`
5. For job queue changes: verify queue strategy config in `VendureConfig.jobQueueOptions`
6. Start both server and worker locally; confirm startup logs show all plugins initialized
7. For email changes: test template rendering with Vendure email plugin dev mode
8. Run migration in dev before testing feature; rollback tested via TypeORM `migration:revert`

## Commands

```bash
# Start server + worker locally
yarn ts-node src/index.ts
yarn ts-node src/worker.ts

# Alternatively with tsx
yarn tsx src/index.ts

# TypeORM migrations
yarn typeorm migration:generate -- -n MigrationName -d src/vendure-config.ts
yarn typeorm migration:run -d src/vendure-config.ts
yarn typeorm migration:revert -d src/vendure-config.ts

# Build
yarn build / npm run build

# Tests
jest --testPathPattern e2e
jest --testPathPattern spec
```

## Validation checklist

- [ ] Plugin added to `plugins` array in correct position (order-dependent plugins sorted correctly)
- [ ] Required env vars documented and present in `.env.example`
- [ ] TypeORM migration generated and reviewed — no destructive column drops without data migration
- [ ] Worker bootstrap includes plugins that handle background jobs
- [ ] Server starts without errors: check plugin `init()` and DB connection logs
- [ ] Worker starts without errors: check job queue connection and registered job handlers
- [ ] Email templates rendered correctly using dev preview mode
