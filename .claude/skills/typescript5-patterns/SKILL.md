---
name: typescript5-patterns
description: TypeScript router. Use for type contracts, API boundaries, generics, and strictness-safe refactors.
---

# TypeScript 5 Patterns

## Use when

- task changes public types, DTOs, shared interfaces, or utility generics
- task touches compile-time contract safety across package boundaries

## Do not use when

- task is purely runtime configuration with no type contract impact
- task is language-agnostic docs-only update

## Inspect first

- impacted `types.ts`, model/schema files, and exported interfaces
- call sites consuming changed types across apps/packages
- tsconfig/strictness settings if compiler behavior involved

## Avoid mistakes

- widening to `any` or unsafe casts to silence compiler
- changing exported types without migrating downstream consumers
- mixing runtime validation assumptions with static type checks

## Router

1. Load `references/conventions.md` for naming, do/don't, and forbidden patterns.
2. Load `references/scope.md` for contract-focused file map.
3. Load `references/workflow.md` only for type-migration flow.
4. Prefer narrow, explicit types and safe incremental migration.

## References

- references/scope.md
- references/workflow.md
