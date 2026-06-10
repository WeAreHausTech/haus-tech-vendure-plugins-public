## Naming conventions

- Plugin class: `XxxPlugin` decorated with `@VendurePlugin({ ... })`
- Resolver: `XxxResolver` decorated with `@Resolver()`
- Service: `XxxService` decorated with `@Injectable()`
- Entity: `XxxEntity` extending `VendureEntity`, decorated with `@Entity()`
- Admin SDL extension: `gqlAdminExtension` constant in `xxx.graphql.ts`
- Shop SDL extension: `gqlShopExtension` constant in `xxx.graphql.ts`
- Migration: TypeORM auto-generated name including plugin prefix

## Do / don't

DO: Apply `@Allow(Permission.xxx)` to all admin API mutations — DON'T: leave admin mutations without a permission check
DO: Use `TransactionalConnection` for all database access in services — DON'T: inject raw TypeORM `Repository` or `EntityManager` directly
DO: Define SDL extensions (`gqlAdminExtension` / `gqlShopExtension`) before writing the resolver — DON'T: write resolver methods without the corresponding SDL type/field definition
DO: Register all plugin entities in `@VendurePlugin({ entities: [XxxEntity] })` — DON'T: define an entity without registering it (TypeORM won't create the table)
DO: Import only from `@vendure/core` public API — DON'T: import from `@vendure/core/dist/` internal paths
DO: Generate a migration for every entity schema change — DON'T: rely on `synchronize: true` in production

## Forbidden patterns

NEVER: Admin API mutation without `@Allow(Permission.xxx)` decorator — unauthenticated admin write access
NEVER: Shop API mutation that can return or modify another customer's data without ownership check — data exposure
NEVER: Plugin that directly modifies core Vendure entity definitions — breaks core compatibility and upgrades
NEVER: Business logic or DB query inside a resolver method — delegate to service layer
NEVER: Entity not listed in `@VendurePlugin({ entities: [...] })` — TypeORM does not create/migrate the table
NEVER: Import from `@vendure/core` internal paths — unstable, breaks on Vendure upgrades
