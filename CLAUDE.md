<!-- HAUS:BEGIN haus-imports v=1 -->
@.haus-workflow/WORKFLOW.md
@.haus-workflow/workflow-config.md
@docs/decisions/README.md
<!-- HAUS:END haus-imports -->

# Haus Tech Vendure Plugins (public)

Public, open-source **Nx monorepo** of [Vendure](https://www.vendure.io/) (TypeScript) plugins under `packages/`, each developed, built, tested, and **published to npm independently** under the `@haus-tech/` scope. No application/server lives here — these are libraries that consuming Vendure apps depend on.

Plugins (3):

- `packages/badge-plugin` — `@haus-tech/badge-plugin`: image badges (e.g. "New", "Sale") attached to collections and inherited by their products; channel-aware, exposed on `Product`, `ProductVariant`, and `SearchResult` via the Shop API.
- `packages/elastic-search-synonyms` — `@haus-tech/elastic-search-synonyms`: manage Elasticsearch synonym sets from the Vendure admin UI / Dashboard; synced to Elasticsearch via the Synonyms API.
- `packages/product-import-export-plugin` — `@haus-tech/product-import-export-plugin`: bulk import/export of products via CSV, with pluggable local/S3 storage strategies.

## Setup

Yarn 4 (Corepack) + Node `>=20`. `yarn install` at the repo root installs all workspaces. No `.env` is required to build or test the libraries. See [docs/setup.md](docs/setup.md).

## Commands

Root scripts wrap Nx `run-many` / `affected` over `packages/*`. Run from the repo root.

| Command                     | Action                                                        |
| --------------------------- | ------------------------------------------------------------- |
| `yarn build`                | Build all plugins (`nx run-many --target=build --all`)        |
| `yarn build:affected`       | Build only affected plugins                                   |
| `yarn test`                 | Run all plugin tests (excludes the root package)              |
| `yarn test:affected`        | Test only affected plugins                                    |
| `yarn lint`                 | Lint all plugins                                              |
| `yarn lint:affected`        | Lint only affected plugins                                    |
| `yarn security:audit`       | `yarn npm audit` — high severity, production deps, recursive  |
| `yarn update-readmes`       | Sync each plugin README version to its `package.json` version |
| `yarn upgrade:vendure`      | Run the `upgrade:vendure` target for all plugins              |
| `yarn upgrade:vendure:all`  | Update root `@vendure/*` dependencies                         |
| `yarn remove-node-modules`  | Remove every `node_modules` directory recursively             |

Single-project variants: `npx nx <target> <project>` (e.g. `npx nx test elastic-search-synonyms`). Typecheck comes from the `@nx/js/typescript` plugin (`npx nx run-many --target=typecheck --all`). Per-plugin `vitest.config.ts` runs unit specs (`*.spec.ts`); the root `vitest.config.ts` runs e2e specs (`packages/**/*.e2e-spec.ts`).

## Key conventions

- **Each plugin is an independent npm library.** Versioning, changelog, and tags are per-project — see [docs/deployment.md](docs/deployment.md). Plugin versions track the supported **Vendure major.minor** (see [README.md](README.md)); `badge-plugin` is currently an exception.
- **Plugin entry point** is `src/<name>.plugin.ts` decorated with `@VendurePlugin`; the public surface is re-exported from `src/index.ts` (the package `main`/`types`). Angular Admin UI extensions live in `src/ui/`, React Dashboard extensions in `src/dashboard/`.
- **Declare Vendure compatibility** on the plugin (`compatibility: '^3.6.0'`) *and* in `package.json` `peerDependencies` — both must agree.
- **Releases use Nx Release** (`nx release`, independent projects, tag pattern `{projectName}@{version}`); publish access is `public`. Do not hand-bump versions — let `nx release` drive version + changelog from Conventional Commits.
- **Generated GraphQL** (`src/gql/generated.ts`, `src/ui/gql/`) is generated output — regenerate, do not hand-edit. No codegen config is committed in this repo (see [docs/conventions.md](docs/conventions.md)).
- **No CI quality gate and no pre-commit hook exist.** Lint, build, test, and audit are local-only — run them yourself before pushing. The single GitHub Actions workflow syncs plugin markdown to the public docs site.
- **Public repository.** Keep code, docs, and commit messages free of customer names, internal hostnames, credentials, and internal-only process detail.
- **Docs are an index:** use path references in `docs/`; read source for implementation detail.
- **Keep docs in sync:** after setup, commands, env, deploy, or plugin-surface changes, run the **writing-documentation** skill in this repo and commit doc updates with the code change.

## Before opening a PR

- [ ] Run the checks locally — nothing runs them for you: `yarn lint`, `yarn build`, `yarn test` (or the `:affected` variants)
- [ ] Use Conventional Commits — they drive `nx release` version bumps and changelogs
- [ ] Run the **writing-documentation** skill in this repo when setup, commands, plugin surface, or release flow changed (or N/A)
- [ ] Docs reflect this change or explicitly N/A
- [ ] Plugin README / `package.json` / `peerDependencies` / plugin `compatibility` updated when the public API or supported Vendure version changed
- [ ] Nothing internal-only added to this public repo

## Docs

[docs/SUMMARY.md](docs/SUMMARY.md)
