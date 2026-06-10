---
name: vitest-patterns
description: Vitest router. Use for TypeScript/JS unit and integration tests, mocking strategy, and coverage config.
---

# Vitest Patterns

## Use when

- task changes TypeScript/JS behavior and needs unit/integration test updates
- task touches `*.test.ts(x)`, `*.spec.ts(x)`, `vitest.config.*`, or `vitest.setup.*`
- task introduces or modifies a `vi.mock` / `vi.spyOn` boundary

## Do not use when

- task is browser end-to-end behavior (use `playwright-patterns`)
- task is component DOM behavior wired through Testing Library only — combine with `testing-library-patterns`
- task is Jest, PHPUnit, or non-Vitest framework code

## Inspect first

- changed module under test and its direct imports
- nearest `vitest.config.*` and `vitest.setup.*` (environment, aliases, setup files)
- existing `__mocks__` folder or shared fixtures used by neighboring tests
- coverage thresholds in `vitest.config.*` `coverage` block

## Avoid mistakes

- mocking the module under test instead of its collaborators
- relying on test execution order or shared module-scope state across files
- mixing `jsdom` and `node` environments in a single suite without `// @vitest-environment` directive
- asserting implementation details (call counts on private helpers) instead of observable behavior

## Router

1. Load `references/conventions.md` for naming, do/don't, and forbidden patterns.
2. Load `references/scope.md` for Vitest file targeting and stack boundaries.
3. Load `references/workflow.md` only for failing-test diagnosis and coverage flow.
4. Keep tests behavior-focused, isolated, and deterministic.

## References

- references/conventions.md
- references/scope.md
- references/workflow.md
