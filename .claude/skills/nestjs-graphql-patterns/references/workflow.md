# Workflow

## Implementation steps

1. Identify feature module: locate `*.module.ts` for the feature area
2. Define DTO/input: create or update `*.input.ts` with `@InputType()` and `@Field()` decorators
3. Add class-validator decorators to input: `@IsString()`, `@IsUUID()`, `@IsOptional()`, etc.
4. Implement resolver method: `@Query(() => ReturnType)` or `@Mutation(() => ReturnType)`
5. Apply `@UseGuards(GqlAuthGuard)` and `@Roles(...)` to privileged resolvers
6. Inject service in resolver constructor — resolver delegates, does not contain logic
7. Regenerate schema if codegen is configured: run codegen command
8. Write unit test for resolver (mocked service) and service (mocked repo)

## Commands

```bash
nest generate module feature
nest generate resolver feature
nest generate service feature

# GraphQL codegen
yarn graphql-codegen --config codegen.yml

# Type check
yarn tsc --noEmit

# Tests
jest --testPathPattern resolver
jest --testPathPattern service
jest --coverage

# Schema introspection (local)
yarn ts-node src/generate-schema.ts   # or project-specific script
```

## Validation checklist

- [ ] All mutations have `@UseGuards` — no privileged write is unprotected
- [ ] Input DTOs validated with class-validator; `ValidationPipe` enabled globally
- [ ] Resolver returns type matches `@ObjectType()` decorated class — not raw entity
- [ ] Service handles error cases and throws `NotFoundException` / `ForbiddenException`
- [ ] No N+1: use DataLoader or batch service for nested object field resolvers
- [ ] `@ResolveField` methods do not trigger duplicate DB queries per parent
- [ ] Schema codegen output committed and consistent with resolver changes
