# Scope

## In-scope files and dirs

- `**/*.test.ts(x)` / `**/*.spec.ts(x)` — unit and integration tests
- `tests/integration/**/*.integration.test.ts` — cross-module integration suites
- `vitest.config.ts` / `vitest.config.js` — root test runner config
- `vitest.setup.ts` / `vitest.setup.js` — global setup hooks, polyfills, matchers
- `__mocks__/**` — module-level auto-mocks
- `tests/fixtures/**` — shared fixtures and factories
- `test/**` (Vendure plugin convention) — plugin-local test suites

## Stack boundaries

- Vitest unit: pure modules, mocked collaborators, no DOM unless `// @vitest-environment jsdom`
- Vitest integration: composes real modules; mocks only at process/network boundary
- DOM rendering with React/Vue → combine with `testing-library-patterns`
- Browser E2E flow → not in scope, use `playwright-patterns`
- Storybook interaction tests → not in scope, use `storybook-patterns`
- PHP/Laravel tests → not in scope, use `phpunit-patterns`

## Triggers

- Adding or changing a TS/JS exported function or class
- Modifying a Vite/Next/Vue config that affects module resolution under test
- Introducing a new module boundary that needs a `vi.mock` contract
- Adding a regression test for a production bug
- Changing coverage thresholds or excluding paths from coverage
- Updating `vitest.setup.*` to register new matchers or global polyfills
