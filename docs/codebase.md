# Codebase

Nx monorepo of independently published Vendure plugin libraries. No application/server source — each `packages/*` is an npm library.

## Top-level directories

| Path        | Purpose                                                                           |
| ----------- | --------------------------------------------------------------------------------- |
| `packages/` | Plugin libraries (one npm package each)                                           |
| `scripts/`  | Repo utility scripts (`update-readmes.ts` — syncs README version to package.json) |
| `dist/`     | Build output (`dist/packages/<name>`), git-ignored; publish root for npm          |

## Root config and wiring

| File                     | Purpose                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`           | Root workspace (`workspaces: packages/*`), shared dev deps, root scripts, Yarn 4, npm `resolutions`                                    |
| `nx.json`                | Nx target defaults, `@nx/js/typescript` + `@nx/vite` plugins, **release** config (independent projects, tag `{projectName}@{version}`) |
| `tsconfig.base.json`     | Shared TS compiler options (ES2022, CommonJS, decorators, `strict`)                                                                    |
| `tsconfig.e2e.json`      | TS config for e2e specs                                                                                                                |
| `vitest.config.ts`       | Root Vitest config — runs `packages/**/*.e2e-spec.ts` (node env, SWC, `@plugins` alias)                                                |
| `eslint.config.cjs`      | Flat ESLint config (root)                                                                                                              |
| `.prettierrc`            | References `@haus-tech/prettier-config`                                                                                                |
| `.yarnrc.yml` / `.npmrc` | Yarn 4 / npm registry configuration (may contain auth — do not read/print)                                                             |

## Plugin inventory

Each plugin follows the same layout: `src/<name>.plugin.ts` (the `@VendurePlugin`), `src/index.ts` (public exports = package `main`/`types`), `project.json` (Nx targets), `package.json`, `README.md`, `CHANGELOG.md`, `tsconfig*.json`, `vitest.config.ts`.

### `packages/elastic-search-synonyms` — `@haus-tech/elastic-search-synonyms`

Manage Elasticsearch synonym sets from the Vendure admin UI / Dashboard. Synonym groups are persisted in the DB, synced to Elasticsearch on startup and on change via the Elasticsearch Synonyms API (ES 8.x/9.x). License MIT. `peerDependencies`: `@elastic/elasticsearch`, `@vendure/core ^3.6.0`.

| Path                                       | Purpose                                                           |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `src/elastic-search-synonyms.plugin.ts`    | Plugin definition; `onApplicationBootstrap` syncs synonyms to ES  |
| `src/entity/synonym-group.entity.ts`       | `SynonymGroup` TypeORM entity                                     |
| `src/services/synonym.service.ts`          | CRUD + DB→ES sync orchestration (exported)                        |
| `src/services/elastic-synonyms.service.ts` | Talks to the Elasticsearch Synonyms API                           |
| `src/api/`                                 | Admin GraphQL schema extension + resolver                         |
| `src/elasticsearch/default-settings.ts`    | Index config helpers (`synonym_filter`/`synonym_analyzer`)        |
| `src/utils/synonyms-set-id.helper.ts`      | Synonyms-set id resolution (incl. channel-specific)               |
| `src/ui/`                                  | Angular admin UI extension (route `synonyms`, en/sv translations) |
| `src/dashboard/`                           | New Vendure Dashboard (React) extension                           |
| `src/gql/generated.ts`                     | Generated GraphQL types (do not hand-edit)                        |

### `packages/product-import-export-plugin` — `@haus-tech/product-import-export-plugin`

Bulk import/export of products via CSV: validation, custom fields, assets, facets, variants; pluggable local/S3 storage; admin UI + Dashboard; optional completion email. License MIT. `peerDependencies`: `@vendure/core ^2 || ^3`, `@vendure/email-plugin` (optional), `csv-parse`, `csv-stringify`, `slug`.

| Path                                                                         | Purpose                                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/product-import-export.plugin.ts`                                        | Plugin definition; wires storage strategies, adds `Asset.hash` custom field |
| `src/api/`                                                                   | NestJS controllers: import, export, plugin                                  |
| `src/services/product-import.service.ts`                                     | Import orchestration                                                        |
| `src/services/extended-fast-importer.service.ts`                             | Extended Vendure FastImporter                                               |
| `src/services/product-export.service.ts` / `product-export-queue.service.ts` | Export + async export job queue                                             |
| `src/services/import-storage/`                                               | Import job storage strategies (interface, local, S3)                        |
| `src/services/export-storage/`                                               | Export storage strategies (interface, local, S3)                            |
| `src/providers/import-providers/`                                            | CSV parser, product importer, asset importer                                |
| `src/events/` + `src/handlers/`                                              | `product-exported` event + handler                                          |
| `src/email.ts` + `src/email-templates/`                                      | Export-complete email entry (subpath export `./email`) + template           |
| `src/ui/` / `src/dashboard/`                                                 | Angular admin UI (route `product-importer`) + React Dashboard               |
| `e2e/`                                                                       | End-to-end specs                                                            |

## Where to change what

| Task                                   | Start here                                                      |
| -------------------------------------- | --------------------------------------------------------------- |
| Change a plugin's behavior             | `packages/<plugin>/src/services/` or `src/api/`                 |
| Change a plugin's public API           | `packages/<plugin>/src/index.ts` (+ `package.json` exports)     |
| Add admin UI / Dashboard feature       | `packages/<plugin>/src/ui/` or `src/dashboard/`                 |
| Change supported Vendure version       | plugin `package.json` `peerDependencies` + README               |
| Add a new plugin                       | new `packages/<name>/` with `project.json` + `package.json`     |
| Storage backend (import/export plugin) | `packages/product-import-export-plugin/src/services/*-storage/` |

## Tests

- Unit specs: `packages/<plugin>/src/**/*.spec.ts`, run by each plugin's `vitest.config.ts` via the Nx `test` target.
- E2E specs: `packages/**/*.e2e-spec.ts`, run by the root `vitest.config.ts` (e.g. `packages/product-import-export-plugin/e2e/`).
- `node_modules` is not committed; `yarn install` is required before running tests locally.
