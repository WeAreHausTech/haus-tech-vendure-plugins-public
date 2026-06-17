# Workflow

## Implementation steps

1. Identify storage backend: PostgreSQL/MariaDB/MSSQL (ORM) or Elasticsearch
2. For schema changes: create migration file first — never edit entity without migration
3. Review migration for backward compatibility: old code + new schema must coexist during deploy
4. Check indexes: any new query filter/sort column needs a corresponding index
5. For Elasticsearch: validate mapping change does not require full reindex before go-live
6. Trace all repository/query callers — confirm no N+1 query introduced
7. Run `EXPLAIN ANALYZE` (Postgres) or query plan (MSSQL) for changed queries
8. Update affected tests: integration tests using test DB, not mocks for query behavior

## Commands

```bash
# TypeORM
yarn typeorm migration:generate -- -n DescriptiveName
yarn typeorm migration:run
yarn typeorm migration:revert    # if rollback needed

# Prisma
yarn prisma migrate dev --name descriptive_name
yarn prisma migrate deploy       # CI/prod apply
yarn prisma db pull              # sync schema from existing DB
yarn prisma studio               # inspect data

# Elasticsearch
curl -X PUT "localhost:9200/index-name/_mapping" -H 'Content-Type: application/json' -d @mapping.json

# Tests
jest --testPathPattern repository   # unit/integration repo tests
php artisan test --filter=Database  # Laravel DB tests
```

## Validation checklist

- [ ] Migration is reversible — `down()` method or revert tested
- [ ] No column rename without data migration step
- [ ] New indexes added for every new WHERE / ORDER BY column
- [ ] Elasticsearch mapping change assessed for reindex requirement
- [ ] No N+1 query introduced — repository returns eager-loaded relations as needed
- [ ] DB connection pool size validated against expected load
- [ ] Transaction boundaries cover all related writes atomically
