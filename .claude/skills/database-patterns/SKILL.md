---
name: database-patterns
description: Database router for PostgreSQL, MariaDB, MySQL, MSSQL, Elasticsearch, and Redis data/model/query/cache changes.
---

# Database Patterns

## Use when

- task changes schema, indexes, query behavior, or search mappings
- task touches migrations, repositories/query builders, or ES index definitions
- task changes Redis cache keys, TTLs, eviction strategy, or pub/sub channels

## Do not use when

- task is UI-only data presentation with no persistence/search behavior change
- task is auth/session-only logic with no DB contract impact

## Inspect first

- migrations/schema files and model mappings
- repository/query files for affected feature
- Elasticsearch index templates/mapping files when search involved
- Redis client config (`predis`, `ioredis`, `redis`), cache-key namespaces, and TTL constants when caching/queues involved

## Avoid mistakes

- shipping query changes without index/perf consideration
- introducing non-backward-compatible migration steps without rollout plan
- mixing search document schema with transactional model assumptions
- Redis keys without explicit TTL or namespace prefix — risks unbounded growth and cross-feature collisions

## Router

1. Load `references/conventions.md` for naming, do/don't, and forbidden patterns.
2. Load `references/scope.md` for storage-specific target files.
3. Load `references/workflow.md` only for read/write/search flow analysis.
4. Validate migration safety and query impact before handoff.

## References

- references/scope.md
- references/workflow.md
