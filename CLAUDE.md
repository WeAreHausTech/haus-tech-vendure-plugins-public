<!-- HAUS:BEGIN haus-imports v=1 -->
@.haus-workflow/WORKFLOW.md
@.haus-workflow/workflow-config.md
<!-- HAUS:END haus-imports -->

# Haus Tech Vendure Plugins (public)

Public, open-source counterpart to Haus Tech's Vendure plugins: an **Nx monorepo** of [Vendure](https://www.vendure.io/) (TypeScript) plugins under `packages/`, each developed, built, tested, and **published to npm independently** under the `@haus-tech/` scope. No application/server lives here — these are libraries other Vendure apps depend on.

Plugins (2):

- `packages/elastic-search-synonyms` — `@haus-tech/elastic-search-synonyms`: manage Elasticsearch synonym sets from the Vendure admin UI / Dashboard; synced to Elasticsearch via the Synonyms API.
- `packages/product-import-export-plugin` — `@haus-tech/product-import-export-plugin`: bulk import/export of products via CSV, with pluggable local/S3 storage strategies.

## Setup

Yarn 4 (Corepack) + Node `>=20`. `yarn install` at the repo root installs all workspaces. No `.env` is required to build/test the libraries. See [docs/setup.md](docs/setup.md).

## Commands

Root scripts wrap Nx `run-many` / `affected` over `packages/*`. Run from the repo root.

| Command                | Action                                                          |
| ---------------------- | --------------------------------------------------------------- |
| `yarn build`           | Build all plugins (`nx run-many --target=build --all`)          |
| `yarn build:affected`  | Build only affected plugins                                     |
| `yarn test`            | Run all plugin unit tests (excludes the root package)           |
| `yarn test:affected`   | Test only affected plugins                                      |
| `yarn lint`            | Lint all plugins                                                |
| `yarn lint:affected`   | Lint only affected plugins                                      |
| `yarn update-readmes`  | Sync each plugin README version to its `package.json` version   |
| `yarn upgrade:vendure` | Run the `upgrade:vendure` target for all plugins                |

Single-project variants: `npx nx <target> <project>` (e.g. `npx nx test elastic-search-synonyms`). Typecheck is provided by the `@nx/js/typescript` plugin (`npx nx run-many --target=typecheck --all`). Root-level Vitest config runs `*.e2e-spec.ts`; per-plugin `vitest.config.ts` runs unit specs.

## Key conventions

- **Each plugin is an independent npm library.** Versioning, changelog, and tags are per-project — see [docs/deployment.md](docs/deployment.md). Plugin versions track the supported **Vendure major.minor** (see [README.md](README.md)).
- **Plugin entry point** is `src/<name>.plugin.ts` decorated with `@VendurePlugin`; public surface is re-exported from `src/index.ts` (the package `main`/`types`). Admin UI extensions live in `src/ui/`, Dashboard extensions in `src/dashboard/`.
- **Releases use Nx Release** (`nx release`, independent projects, tag pattern `{projectName}@{version}`); publish access is `public`. Do not hand-bump versions across plugins — let `nx release` drive version + changelog from Conventional Commits.
- **Generated GraphQL** (`src/gql/`, `src/ui/gql/`) is generated — regenerate, do not hand-edit.
- **Docs are an index:** use path references in `docs/`; read source for implementation detail.
- **Keep docs in sync:** after setup, commands, env, deploy, or plugin-surface changes, run the **writing-documentation** skill in this repo and commit doc updates with the code change.

## Before opening a PR

- [ ] Run available checks: `yarn lint`, `yarn build`, `yarn test` (or the `:affected` variants)
- [ ] Use Conventional Commits — they drive `nx release` version bumps and changelogs
- [ ] Run the **writing-documentation** skill in this repo when setup, commands, plugin surface, or release flow changed (or N/A)
- [ ] Docs reflect this change or explicitly N/A
- [ ] Plugin README/`package.json`/`peerDependencies` updated when the public API or supported Vendure version changed

## Docs

[docs/SUMMARY.md](docs/SUMMARY.md)
