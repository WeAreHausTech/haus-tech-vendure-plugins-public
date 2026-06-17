# Scope

## In-scope files and dirs

- `src/**/migrations/**` — TypeORM, Prisma, or raw SQL migrations
- `src/**/entities/**`, `src/**/models/**` — ORM entity/model definitions
- `src/**/repositories/**` — query builder, repository classes, raw query files
- `prisma/schema.prisma` — Prisma schema (models, relations, enums)
- `src/**/elasticsearch/**`, `src/**/search/**` — ES index config, mapping templates
- `typeorm.config.*`, `database.config.*` — connection and pool config
- `src/**/*.repository.ts`, `src/**/*.dao.ts` — data access objects

## Stack boundaries

- PostgreSQL: entity/migration via TypeORM or Prisma; query optimization with EXPLAIN
- MariaDB/MySQL: migration compatibility differences vs Postgres (JSON type, charset)
- MSSQL: schema-qualified tables, TOP vs LIMIT, datetime2 vs timestamptz
- Elasticsearch: index mapping templates, analyzers, search DSL queries
- Not in scope: UI presentation layer consuming API responses
- Not in scope: auth/session logic with no DB model change

## Triggers

- Adding, removing, or renaming columns/tables
- Adding indexes or changing index strategies
- Changing relation cardinality (1:1, 1:N, M:N)
- Adding or modifying Elasticsearch index mapping or analyzer
- Changing query builder logic (joins, subqueries, aggregations)
- Changing transaction boundaries or isolation levels
