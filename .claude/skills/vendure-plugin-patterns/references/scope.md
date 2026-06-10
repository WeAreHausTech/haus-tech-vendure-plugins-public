# Scope

## In-scope files and dirs

- `src/plugins/**/plugin.ts`, `*.plugin.ts` — `@VendurePlugin` decorated module class
- `src/plugins/**/api/**` — GraphQL API extension files (schema extension, resolvers)
- `src/plugins/**/services/**` — plugin service classes injected into resolvers
- `src/plugins/**/entities/**` — TypeORM entity classes for plugin-specific DB tables
- `src/plugins/**/migrations/**` — TypeORM migrations for plugin entities
- `src/plugins/**/config/**` — plugin options interface and default config
- `src/plugins/**/*.spec.ts`, `src/plugins/**/*.e2e-spec.ts` — plugin tests
- `codegen.ts` (plugin-level) — GraphQL codegen config for generated types

## Stack boundaries

- Vendure 3 plugin API: `@VendurePlugin`, `PluginCommonModule`, `EventBus`, `JobQueue`
- API extension: `SchemaExtensionScope` (shop/admin), custom resolver fields, custom mutations
- Entities: extend `VendureEntity` / use `@Entity()` with plugin-scoped migrations
- Not in scope: Vendure app-level config changes (use vendure-app-patterns)
- Not in scope: storefront Next.js/React components

## Triggers

- Adding a new custom entity with DB migration
- Adding a new GraphQL mutation or query to shop or admin API
- Adding or changing plugin service business logic
- Adding resolver for a new field on existing Vendure type
- Changing plugin configuration options interface
- Adding EventBus subscriber to listen for Vendure core events
- Changing channel or permission checks in admin resolver
