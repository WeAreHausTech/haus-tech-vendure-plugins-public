# Workflow

## Implementation steps

1. Start from `*.plugin.ts`: identify `SchemaExtensionScope`, entity list, and provider registrations
2. For new entity: create TypeORM entity extending `VendureEntity`; generate migration; register in plugin `entities`
3. For new API field: add to `gqlShopExtension` or `gqlAdminExtension` SDL; implement resolver method
4. Apply `@Allow(Permission.*)` to admin mutations — check permission enum in Vendure core
5. For shop API mutations: verify customer authentication check where required
6. Implement service method called from resolver; inject `TransactionalConnection` for DB access
7. Run codegen to regenerate plugin types after SDL change
8. Write e2e spec: bootstrap Vendure test server, call mutation/query, assert DB state

## Commands

```bash
# Generate TypeORM migration for plugin entity
yarn typeorm migration:generate -- -n PluginEntityMigration -d src/vendure-config.ts

# GraphQL codegen (plugin-level)
yarn graphql-codegen --config codegen.ts

# Type check
yarn tsc --noEmit

# Run plugin e2e tests
jest --testPathPattern e2e-spec
jest --testPathPattern plugin-name

# Build plugin package
yarn build / yarn tsup src/index.ts
```

## Validation checklist

- [ ] Plugin entity registered in `@VendurePlugin({ entities: [...] })` array
- [ ] Migration generated and reviewed before testing schema-dependent behavior
- [ ] Admin mutations decorated with `@Allow(Permission.*)` — no unprotected admin writes
- [ ] Shop mutations check customer authentication where user-specific data accessed
- [ ] Resolver delegates to service — no direct DB queries in resolver methods
- [ ] Plugin does not import from Vendure internal paths (only `@vendure/core`)
- [ ] e2e spec covers success path, unauthorized access, and invalid input rejection
