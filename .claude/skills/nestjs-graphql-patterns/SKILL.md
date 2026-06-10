---
name: nestjs-graphql-patterns
description: NestJS GraphQL router. Use for modules, resolvers, DTOs, guards, and schema behavior.
---

# NestJS GraphQL Patterns

## Use when

- task changes GraphQL resolver/module behavior in NestJS APIs
- task touches `*.resolver.ts`, `*.module.ts`, DTO/input files, or auth guards

## Do not use when

- task is pure REST controller work
- task belongs to frontend-only routing/data-fetching

## Inspect first

- feature `module`, `resolver`, `service`, and related DTO/input files
- auth guard/interceptor files used by resolver
- `graphql` config and codegen config if schema-generated

## Avoid mistakes

- changing resolver signatures without updating DTO/input validation
- bypassing auth guards for privileged mutations
- mixing transport concerns into domain services

## Router

1. Load `references/conventions.md` for naming, do/don't, and forbidden patterns.
2. Load `references/scope.md` for resolver-module file map.
3. Load `references/workflow.md` only for mutation/query debug flow.
4. Keep resolver contracts and service contracts aligned.

## References

- references/scope.md
- references/workflow.md
