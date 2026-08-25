# How this project works (workflow methodology bindings)

> The few project-specific values the workflow standard (WORKFLOW.md) binds to:
> where the source-of-truth docs live, the test commands the TDD/verification gate
> runs, the highest-stakes logic, and the pre-commit tool. This file is yours to
> edit and haus will not overwrite it.
>
> Everyday commands (dev, build, lint, typecheck, format) and project documentation
> live in `CLAUDE.md` + `docs/` — run **`/docs`** to generate/refresh them.

## Source-of-truth documents

- Spec: n/a — no product spec in this repo. Each plugin's public contract is its
  `README.md` plus `src/index.ts`; behavioural intent lives in the plugin's TSDoc
  (`@description` / `@example` on the plugin class and exported services).
- Design: n/a — no design doc. Structural decisions are documented in
  `docs/architecture.md` and `docs/conventions.md`.
- UX flows: n/a — the UI surfaces are Vendure Admin UI / Dashboard extensions and
  follow Vendure's own UX; no separate flow docs exist.
- Plans: `docs/plans/<feature-slug>.md` (in use, e.g.
  `docs/plans/secure-import-export-rest-api.md`)
- Decision log: `docs/decisions/` (index at `docs/decisions/README.md`; empty so far)
- Runbook: n/a — no `docs/runbook.md` yet. Create one when the first non-obvious
  failure is resolved; troubleshooting entries currently live in `docs/setup.md`.

## Test commands (TDD / verification gate)

- Test (unit, all projects): `yarn test`
- Test (unit, affected only): `yarn test:affected`
- Test (single project): `npx nx test <project>` (`badge-plugin`,
  `elastic-search-synonyms`, `product-import-export-plugin`)
- Test (E2E): `npx vitest run --config vitest.config.ts` — the root Vitest config
  collects `packages/**/*.e2e-spec.ts`. These boot a Vendure test server via
  `@vendure/testing` and are **not** covered by `yarn test`, which runs the
  per-project unit configs.
- Lint: `yarn lint` / `yarn lint:affected`
- Typecheck: `npx nx run-many --target=typecheck --all`
- Build: `yarn build` / `yarn build:affected`
- Dependency audit: `yarn security:audit`

> Every project sets `passWithNoTests: true`, so a green run does not prove the
> touched code is covered. Confirm your change has a spec before calling it done.
>
> Nothing runs these commands automatically — there is no pre-commit hook and no CI
> quality gate. See `docs/development-workflow.md`.

## Highest-stakes logic

- **REST controller authorization** in
  `packages/product-import-export-plugin/src/api/*.controller.ts`. These are the only
  HTTP endpoints this repo adds to a host app; a missing guard exposes product data
  and storage credentials. Regression-guarded by
  `packages/product-import-export-plugin/e2e/rest-api-security.e2e-spec.ts` — extend
  it in the same change, TDD-first.
- **Storage strategy selection and path handling** in
  `packages/product-import-export-plugin/src/services/{import,export}-storage/`. A
  path or credential bug here writes data to the wrong place or leaks it.
- **Channel scoping** in `packages/badge-plugin/src/service/badge.service.ts` and
  `src/api/shop.resolver.ts`. Badges are channel-assigned and surfaced on the public
  Shop API; a scoping bug leaks one channel's merchandising into another.
- **Elasticsearch synonym sync** in
  `packages/elastic-search-synonyms/src/services/`. Runs at host bootstrap against a
  shared search cluster; a bad sync degrades search for the whole host app.

## Pre-commit tool

- Tool: n/a — no pre-commit hook is installed (no `lefthook.yml`, no Husky, no
  `.githooks`). The workflow standard recommends Lefthook and carries an example
  config in `.claude/templates/agentic-workflow-standard.md` ("Pre-commit hooks");
  nothing is wired up here yet.
  > CONFIRM-WITH-TEAM: whether to adopt Lefthook here and whether to add a CI
  > workflow running lint/build/test — today nothing prevents a red commit reaching
  > `main`.
