## Naming conventions

- Types and interfaces: PascalCase — `UserProfile`, `OrderStatus`; no `I` prefix on interfaces
- Type-only imports: `import type { Foo } from './foo'` — always use `import type` for type-only imports
- Utility type compositions: declared as named types, not inlined (e.g. `type PartialOrder = Partial<Order>`)
- Discriminated union variants: share a `kind` or `type` literal field (e.g. `{ kind: 'success'; data: T }`)
- Generic type parameters: single uppercase letter for simple generics (`T`, `K`, `V`); descriptive for complex (`TEntity`, `TKey`)

## Do / don't

DO: Use `satisfies` for object literals with a known shape to get inference + type checking — DON'T: use `as` cast as a substitute for `satisfies`
DO: Use `unknown` for external/unvalidated data (API responses, `JSON.parse`) — DON'T: use `any` for external data; defeats type safety
DO: Add `extends` constraints on all generics — DON'T: leave unconstrained generics where a meaningful constraint exists
DO: Use `import type` for type-only imports — DON'T: mix value and type imports unnecessarily (increases bundle risk)
DO: Narrow types with `instanceof`, `typeof`, or type predicates before use — DON'T: cast with `as` without a preceding narrowing proof
DO: Prefer `@ts-expect-error` over `@ts-ignore` when suppression is needed — DON'T: use `@ts-ignore` (does not fail if the error disappears)

## Forbidden patterns

NEVER: `any` in a public API type signature — infects all consumers with `any`
NEVER: `as unknown as T` double-cast — circumvents the type system without a safety check
NEVER: `// @ts-ignore` — use `// @ts-expect-error` with a comment explaining why
NEVER: `{}` as a "non-null, non-undefined" type — use `NonNullable<T>` or a concrete type
NEVER: Re-declare a standard utility type (`type MyPartial<T> = { [K in keyof T]?: T[K] }`) — use built-ins
NEVER: Circular type alias that causes infinite recursion — use `interface` with `extends` for recursive types
