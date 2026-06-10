# Workflow

## Implementation steps

1. Identify test type: unit (isolated module, mocked collaborators) or integration (real composition, mock only at process boundary).
2. Place the test file colocated with source (`foo.ts` ↔ `foo.test.ts`) or under `tests/integration/` for integration scope.
3. Choose environment: default `node`; for DOM/React/Vue add `// @vitest-environment jsdom` at file top or set in `vitest.config.*`.
4. Hoist module mocks at file scope with `vi.mock("./api")`; never inside `beforeEach`.
5. For time-dependent logic, call `vi.useFakeTimers()` in `beforeEach` and `vi.useRealTimers()` in `afterEach`.
6. Reset mocks in `afterEach` with `vi.restoreAllMocks()` to prevent cross-test leakage.
7. For async errors, use `await expect(fn()).rejects.toThrow(SpecificError)` — not bare `toThrow()`.
8. Add a regression test BEFORE applying a bug fix; confirm it fails on the broken code first.
9. Check coverage on changed files only via `--coverage --changed`; target branch coverage, not raw line %.

## Commands

```bash
yarn vitest                                    # watch mode
yarn vitest run                                # single CI-style run
yarn vitest run path/to/file.test.ts           # run one file
yarn vitest run -t "createOrder returns"       # run by test name pattern
yarn vitest --coverage                         # generate coverage (v8/istanbul per config)
yarn vitest --reporter=verbose                 # readable output for diagnosis
yarn vitest --ui                               # interactive UI for local debugging
yarn vitest run --changed                      # only files changed vs base branch
yarn vitest run --bail=1                       # stop on first failure
```

## Validation checklist

- [ ] Each test isolated — passes alone (`vitest run -t "..."`) and in full suite (`vitest run`)
- [ ] `vi.mock` calls at file scope, not inside lifecycle hooks
- [ ] `afterEach` restores mocks/timers; no leakage between tests
- [ ] Async errors asserted with `rejects.toThrow(SpecificError)`, not bare `toThrow`
- [ ] No `setTimeout`/`setInterval` without `vi.useFakeTimers()`
- [ ] Regression test added BEFORE bug fix landed
- [ ] Coverage on changed files meets branch threshold in `vitest.config.*`
- [ ] No real network/DB calls — confirmed by grepping `fetch(`, `http`, DB drivers in diff
- [ ] Skipped tests (`it.skip`) carry a linked ticket comment
