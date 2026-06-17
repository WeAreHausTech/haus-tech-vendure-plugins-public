# Scope

## In-scope files and dirs

- `tsconfig.json`, `tsconfig.base.json`, `tsconfig.*.json` — compiler options, path aliases, project references
- `src/**/types.ts`, `src/**/types/**` — shared type definitions and utility types
- `src/**/*.d.ts` — ambient type declarations
- `src/**/interfaces/**`, `src/**/models/**` — domain interfaces and model types
- `packages/*/src/index.ts` — public type exports from library packages
- `src/**/*.ts` (type annotations only) — files where type contracts are being changed

## Stack boundaries

- TypeScript 5/6: strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, decorators
- Utility types: `Partial`, `Required`, `Pick`, `Omit`, `Awaited`, `ReturnType`, mapped types, template literals
- Module augmentation: `declare module '...'` for third-party type extensions
- Not in scope: purely runtime behavior changes with no type contract impact
- Not in scope: language-agnostic config or docs changes

## Triggers

- Adding or changing exported interface or type alias
- Enabling stricter `tsconfig` options (`strict`, `noUncheckedIndexedAccess`)
- Adding generics or conditional types to a shared utility
- Changing module path aliases in `tsconfig.base.json`
- Adding ambient type declarations for untyped packages
- Refactoring to remove `any`, `@ts-ignore`, or unsafe casts
- Changing `experimentalDecorators` or `emitDecoratorMetadata` settings
