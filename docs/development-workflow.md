# Development workflow

## Scope of this repo

Maintain and publish reusable Vendure plugin libraries. Changes are library changes (behavior, public API, supported Vendure version) — there is no app to deploy from here. Each plugin releases to npm independently (see [deployment.md](deployment.md)).

## Common changes

| Change type                          | Start here                                                      |
| ------------------------------------ | --------------------------------------------------------------- |
| Plugin behavior                      | `packages/<plugin>/src/services/` (or `src/service/`), `src/api/` |
| Public API of a package              | `packages/<plugin>/src/index.ts` (+ `package.json` `exports`)    |
| Admin UI / Dashboard                 | `packages/<plugin>/src/ui/` or `src/dashboard/`                  |
| Supported Vendure version            | plugin `package.json` `peerDependencies` + plugin `compatibility` + README |
| GraphQL schema (admin or shop)       | `src/api/api-extensions.ts` + the matching resolver, then regenerate types |
| Add a new plugin                     | new `packages/<name>/` (mirror an existing plugin's structure)   |
| Storage backend (import/export)      | `packages/product-import-export-plugin/src/services/{import,export}-storage/` |
| Badge positions / channel behavior   | `packages/badge-plugin/src/service/badge.service.ts`, `src/api/shop.resolver.ts` |

## Quality checks

**Nothing runs these for you.** There is no pre-commit hook and no CI workflow that lints, builds, tests, or audits — the only GitHub Actions workflow in this repo syncs plugin markdown to the public docs site. Run the checks locally from the repo root before pushing:

```bash
yarn lint           # or yarn lint:affected
yarn build          # or yarn build:affected
yarn test           # or yarn test:affected
yarn security:audit # yarn npm audit -A -R --severity high --environment production
```

- Typecheck target (from `@nx/js/typescript`): `npx nx run-many --target=typecheck --all`.
- Use **Conventional Commits** (`feat:`, `fix:`, `perf:`, …) — `nx release` derives version bumps and changelogs from them.
- `nx release` runs affected `test` + `build` in its `preVersionCommand`, so a broken build blocks a release — but only at release time, not at push time.

> No pre-commit hook is installed (no `lefthook.yml`, no Husky). The workflow standard recommends Lefthook and carries an example config in `.claude/templates/agentic-workflow-standard.md`; `.claude/templates/decisions-ci-gate.yml` is a ready-to-paste ADR-gate job if a CI workflow is ever added.

## Generated artifacts

- GraphQL types are generated (`src/gql/generated.ts`, `src/ui/gql/`) and committed. Regenerate rather than hand-editing.
  > CONFIRM-WITH-TEAM: no GraphQL codegen configuration or script is committed in this repo, so the exact regeneration command is not discoverable from the code. Confirm and document it here.
- Plugin README version lines are generated from `package.json` by `scripts/update-readmes.ts` (`yarn update-readmes`); the docs-sync workflow also runs it before syncing, and each plugin's Nx `update-readme` target runs it during `version`.

## Tests

- **Unit specs** live next to source as `*.spec.ts` and run per plugin via the Nx `test` target (Vitest + SWC). Coverage today is thin — only `elastic-search-synonyms` has unit specs.
- **E2E specs** are `*.e2e-spec.ts`, collected by the root `vitest.config.ts` (node environment, `@plugins` alias, 120s hook timeout, `@vendure/testing` inlined). They live in `packages/badge-plugin/e2e/` and `packages/product-import-export-plugin/e2e/`.
- Every project sets `passWithNoTests: true`, so a green `yarn test` does **not** prove a plugin is covered. Check that your change actually has a spec.
- All new code should ship with tests; run the touched plugin's tests and record passing output (see `.haus-workflow/WORKFLOW.md` verification gate).

See [deployment.md](deployment.md) for releasing and publishing.
