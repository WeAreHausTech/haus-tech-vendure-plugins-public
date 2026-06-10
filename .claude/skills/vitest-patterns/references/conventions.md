## Naming conventions

- Test files colocated with source: `foo.ts` ↔ `foo.test.ts` (or `__tests__/foo.test.ts`)
- Integration suites end in `.integration.test.ts` and live under `tests/integration/`
- `describe` block names mirror the exported symbol or behavior: `describe("createOrder", ...)`
- `it` / `test` names start with a verb in present tense: `it("returns null when input empty")`
- Mock files in `__mocks__/<module>.ts` adjacent to consumer; auto-loaded by `vi.mock("<module>")`
- Test fixtures in `tests/fixtures/` with one factory per domain entity
- Setup files referenced from `vitest.config.*` `test.setupFiles`, never imported by individual tests

## Do / don't

DO: Reset all mocks via `vi.restoreAllMocks()` in `afterEach` — DON'T: rely on Vitest auto-reset defaults across configs
DO: Use `vi.useFakeTimers()` for time-dependent code — DON'T: `await new Promise(r => setTimeout(r, n))` in tests
DO: Mock at the module boundary with `vi.mock("./api")` — DON'T: deeply mock implementation internals
DO: Prefer `expect(...).toMatchInlineSnapshot()` for small structural assertions — DON'T: commit huge external snapshot files for fast-moving shapes
DO: Use `beforeEach` to build fresh test data — DON'T: share mutable factories across `it` blocks
DO: Assert error type and message with `expect(fn).rejects.toThrow(SpecificError)` — DON'T: rely on `toThrow()` with no matcher
DO: One behavior per `it` block — DON'T: chain unrelated assertions in a single test

## Forbidden patterns

NEVER: real network or DB calls in unit tests — mock at the module boundary or use a contract-test layer
NEVER: `setTimeout` / `setInterval` without `vi.useFakeTimers()` — flaky, slow, order-dependent
NEVER: shared module-scope mutable state between files — Vitest parallelizes by file; state leaks cause flake
NEVER: `vi.mock` inside `beforeEach` — module mocks must be hoisted at file scope
NEVER: `expect.assertions(n)` as a substitute for proper async/await flow control
NEVER: importing test helpers from `dist/` or built output — always import from `src/`
NEVER: skipping tests with `it.skip` without a linked ticket in the comment above the line
