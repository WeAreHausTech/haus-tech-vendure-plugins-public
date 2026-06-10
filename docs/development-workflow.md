# Development workflow

## Scope of this repo

Maintain and publish reusable Vendure plugin libraries. Changes are library changes (behavior, public API, supported Vendure version) — there is no app to deploy from here. Each plugin releases to npm independently (see [deployment.md](deployment.md)).

## Common changes

| Change type                         | Start here                                                       |
| ----------------------------------- | ---------------------------------------------------------------- |
| Plugin behavior                     | `packages/<plugin>/src/services/` or `src/api/`                  |
| Public API of a package             | `packages/<plugin>/src/index.ts` (+ `package.json` `exports`)    |
| Admin UI / Dashboard                | `packages/<plugin>/src/ui/` or `src/dashboard/`                  |
| Supported Vendure version           | plugin `package.json` `peerDependencies` + README compatibility  |
| GraphQL schema (synonyms plugin)    | `src/api/api-extensions.ts`, then regenerate types               |
| Add a new plugin                    | new `packages/<name>/` (mirror an existing plugin's structure)   |
| Storage backend (import/export)     | `packages/product-import-export-plugin/src/services/*-storage/`  |

## Quality checks

Run from the repo root before pushing:

```bash
yarn lint           # or yarn lint:affected
yarn build          # or yarn build:affected
yarn test           # or yarn test:affected
```

- Typecheck target (from `@nx/js/typescript`): `npx nx run-many --target=typecheck --all`.
- Use **Conventional Commits** (`feat:`, `fix:`, `perf:`, …) — `nx release` derives version bumps and changelogs from them.
- No repo-level pre-commit hook is installed (a security-scan Lefthook template ships under `.claude/templates/` if wanted). CI runs `yarn npm audit --severity high --recursive` in its workflows.

## Generated artifacts

- GraphQL types are generated (`src/gql/generated.ts`, `src/ui/gql/`). Regenerate rather than hand-editing.
  > CONFIRM-WITH-TEAM: exact GraphQL codegen command (not present as a root script).
- Plugin README versions are generated from `package.json` by `scripts/update-readmes.ts` (`yarn update-readmes`), and also run automatically in CI.

## Tests

- Unit specs live next to source as `*.spec.ts`, run per plugin via the Nx `test` target (Vitest, SWC).
- E2E specs are `*.e2e-spec.ts`, run by the root `vitest.config.ts`.
- All new code should ship with tests; run the touched plugin's tests and record passing output (see WORKFLOW.md verification gate).

See [deployment.md](deployment.md) for releasing/publishing.
