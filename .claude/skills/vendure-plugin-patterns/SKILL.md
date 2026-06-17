---
name: vendure-plugin-patterns
description: Vendure 3 plugin router. Use for plugin modules, resolvers, services, entities, and migrations.
---

# Vendure Plugin Patterns

## Use when

- task changes plugin behavior in `packages/*`, `plugins/*`, or `src/plugins/*`
- task touches `@VendurePlugin`, plugin resolvers, services, or plugin entities

## Do not use when

- task is storefront-only Next.js/React UI work
- task is generic NestJS API without Vendure plugin boundaries

## Inspect first

- `vendure-config.*`, `*.plugin.ts`, `plugin.ts`
- plugin `api`/`resolvers`/`services`/`entities`/`migrations` files
- tests near changed feature (`*.spec.ts`, `*.e2e-spec.ts`)

## Avoid mistakes

- adding resolver fields without schema or migration alignment
- leaking client-specific behavior into shared `@haus/vendure-*` packages
- skipping permission/channel checks in admin mutations

## Router

1. Load `references/conventions.md` for naming, do/don't, and forbidden patterns.
2. Load `references/scope.md` for plugin file map.
3. Load `references/workflow.md` only when implementing or debugging flow.
4. Keep change scoped to one plugin boundary and verify.

## References

- references/scope.md
- references/workflow.md
