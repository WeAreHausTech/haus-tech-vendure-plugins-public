# Scope

## In-scope files and dirs

- `src/**/*.module.ts` — NestJS feature modules with provider/resolver registration
- `src/**/*.resolver.ts` — GraphQL resolvers (`@Query`, `@Mutation`, `@Subscription`)
- `src/**/*.service.ts` — service classes injected into resolvers
- `src/**/dto/**`, `src/**/*.input.ts`, `src/**/*.args.ts` — GraphQL input types and DTOs
- `src/**/*.guard.ts`, `src/**/*.interceptor.ts` — auth guards, logging interceptors
- `src/**/*.decorator.ts` — custom param/method decorators (`@CurrentUser`, etc.)
- `src/graphql.config.ts`, `src/app.module.ts` — root GraphQL module setup
- `codegen.yml`, `graphql.config.js` — schema codegen configuration
- `schema.gql` — generated SDL (do not edit manually)

## Stack boundaries

- NestJS code-first GraphQL: resolvers define schema via decorators, codegen produces SDL
- Auth: `@UseGuards(GqlAuthGuard)` — JWT or session-based guard on resolvers
- Not in scope: REST controller logic (covered by dotnet-patterns or other)
- Not in scope: client-side GraphQL query/mutation hooks (covered by tanstack-query-router-patterns)

## Triggers

- Adding `@Query`, `@Mutation`, or `@Subscription` to a resolver
- Changing input DTO types (`@InputType`, `@ArgsType`, `@Field` decorators)
- Adding or modifying auth guards applied to resolver methods
- Adding a new NestJS feature module with its own resolver
- Changing `GraphQLModule.forRoot` config (context, playground, subscriptions)
- Running schema codegen after resolver changes
