## Naming conventions

- Resolvers: `XxxResolver` — one per top-level GraphQL type or feature module
- Services: `XxxService` — contains all business logic, injected into resolver
- Input DTOs: `CreateXxxInput`, `UpdateXxxInput` decorated with `@InputType()`
- Response DTOs: `XxxObject` / `XxxType` decorated with `@ObjectType()`
- Guards: `GqlAuthGuard` wrapping Passport strategy for GraphQL context extraction
- Modules: `XxxModule` grouping resolver, service, and provider registrations
- Enums: PascalCase decorated with `@registerEnumType()` and description

## Do / don't

DO: Apply `@UseGuards(GqlAuthGuard)` to every mutation that modifies data — DON'T: leave mutations accessible without authentication
DO: Register `ValidationPipe` globally to enforce Input DTO validation automatically — DON'T: manually validate input in resolver methods
DO: Delegate all business logic to the service layer — DON'T: write domain rules or DB queries inside the resolver
DO: Use DataLoader for resolving 1-to-many relations — DON'T: call service.findMany() directly in a field resolver (N+1)
DO: Return dedicated `@ObjectType()` DTOs from resolvers — DON'T: return raw ORM entities directly (exposes internals)
DO: Generate and commit `schema.gql` via codegen after every schema change — DON'T: commit schema changes without regenerating the SDL
DO: Scope data queries to the authenticated user in service layer — DON'T: return other users' data via unscoped queries

## Forbidden patterns

NEVER: Mutation without `@UseGuards()` auth guard — unauthenticated data mutation
NEVER: Business logic or DB query in resolver method body — bypasses service layer testability
NEVER: `schema.gql` committed without running codegen — schema and resolvers drift out of sync
NEVER: Field resolver calling `repository.findMany()` per parent item without DataLoader — N+1 query explosion
NEVER: Inject `Repository` directly into a resolver — data access must go through service
NEVER: `@ObjectType` DTO exposing sensitive fields (password hash, tokens) — credential/data exposure
