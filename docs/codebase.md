# Codebase

Nx monorepo of independently published Vendure plugin libraries. No application/server source — each `packages/*` is an npm library.

## Top-level directories

| Path        | Purpose                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/` | Plugin libraries (one npm package each)                                                                          |
| `scripts/`  | Repo utility scripts (`update-readmes.ts` syncs README versions; `no-next-changelog-renderer.cjs` renders changelogs) |
| `docs/`     | Agent-oriented documentation (this directory)                                                                    |
| `dist/`     | Build output (`dist/packages/<name>`), git-ignored; publish root for npm                                          |

## Root config and wiring

| File                     | Purpose                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`           | Root workspace (`workspaces: packages/*`), shared dev deps, root scripts, Yarn 4 pin, npm `resolutions`                                 |
| `nx.json`                | Nx target defaults, `@nx/js/typescript` + `@nx/vite` plugins, **release** config (independent projects, tag `{projectName}@{version}`) |
| `tsconfig.base.json`     | Shared TS options (target/lib ES2022, `module: CommonJS`, `moduleResolution: Node`, decorators + metadata, `strict`, `composite`)      |
| `tsconfig.e2e.json`      | TS config for e2e specs                                                                                                                |
| `vitest.config.ts`       | Root Vitest config — runs `packages/**/*.e2e-spec.ts` (node env, SWC, `@plugins` alias, `@vendure/testing` inlined)                    |
| `eslint.config.cjs`      | Flat ESLint config (root); each plugin has its own `eslint.config.cjs`                                                                  |
| `.prettierrc`            | References `@haus-tech/prettier-config`                                                                                                |
| `.yarnrc.yml` / `.npmrc` | Yarn 4 / registry configuration; hardened mode, checksum enforcement, scripts disabled, package-age gate. Read `NODE_AUTH_TOKEN` from the environment — never print or commit its value |
| `.github/workflows/`     | One workflow (`sync-markdown.yml`) — docs sync only, no quality gate                                                                    |

Runtime dependencies declared at the **root** and relied on by plugin code: `@elastic/elasticsearch`, `@nestjs/graphql`, `bottleneck`. Plugin-level runtime deps are declared per package (see below).

## Plugin inventory

Each plugin follows the same layout: `src/<name>.plugin.ts` (the `@VendurePlugin`), `src/index.ts` (public exports = package `main`/`types`), `project.json` (Nx targets `build`, `test`, `lint`, `upgrade:vendure`, `version`, `update-readme`), `package.json`, `README.md`, `CHANGELOG.md`, `tsconfig*.json`, `vitest.config.ts`.

### `packages/badge-plugin` — `@haus-tech/badge-plugin`

Image badges (e.g. "New", "Sale") attached to collections and inherited by every product in those collections. Channel-aware; exposed on `Product`, `ProductVariant`, and `SearchResult` via the **Shop API** as well as the Admin API. License MIT. `peerDependencies`: `@vendure/core ^3.6.0`; plugin `compatibility: '^3.6.0'`. The only plugin here with shop-API extensions.

| Path                            | Purpose                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `src/badge.plugin.ts`           | Plugin definition; admin + shop API extensions, `Badge` entity, Dashboard, Admin UI (route `badges`) |
| `src/entity/badge.entity.ts`    | `Badge` TypeORM entity                                                        |
| `src/service/badge.service.ts`  | Badge CRUD, channel assignment, collection→product inheritance (exported)     |
| `src/api/api-extensions.ts`     | Admin + shop GraphQL schema extensions                                        |
| `src/api/admin.resolver.ts`     | Admin API resolver                                                            |
| `src/api/shop.resolver.ts`      | Shop resolvers, incl. `Product` / `ProductVariant` / `SearchResult` field resolvers |
| `src/constants.ts` / `src/types.ts` | Init-options token; `AssignBadgesToChannelInput` and related types        |
| `src/ui/`                       | Angular Admin UI extension (route `badges`, en/sv translations)                |
| `src/dashboard/`                | Vendure Dashboard (React) extension — list + detail views                     |
| `src/gql/generated.ts`, `src/ui/gql/` | Generated GraphQL types (do not hand-edit)                              |
| `e2e/`                          | `badge-plugin.e2e-spec.ts` + fixtures                                         |

### `packages/elastic-search-synonyms` — `@haus-tech/elastic-search-synonyms`

Manage Elasticsearch synonym sets from the Vendure admin UI / Dashboard. Synonym groups are persisted in the DB and synced to Elasticsearch on startup and on change via the Elasticsearch Synonyms API (ES 8.x/9.x). License MIT. `peerDependencies`: `@elastic/elasticsearch ^8 || ^9`, `@vendure/core ^3.6.0`.

| Path                                       | Purpose                                                           |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `src/elastic-search-synonyms.plugin.ts`    | Plugin definition; bootstrap-time sync of synonyms to ES          |
| `src/entity/synonym-group.entity.ts`       | `SynonymGroup` TypeORM entity                                     |
| `src/services/synonym.service.ts`          | CRUD + DB→ES sync orchestration (exported)                        |
| `src/services/elastic-synonyms.service.ts` | Talks to the Elasticsearch Synonyms API                           |
| `src/api/`                                 | Admin GraphQL schema extension + resolver                         |
| `src/elasticsearch/default-settings.ts`    | Index config helpers (`synonym_filter`/`synonym_analyzer`) — has unit specs |
| `src/utils/synonyms-set-id.helper.ts`      | Synonyms-set id resolution (incl. channel-specific) — has unit specs |
| `src/ui/`                                  | Angular Admin UI extension (route `synonyms`, en/sv translations)  |
| `src/dashboard/`                           | Vendure Dashboard (React) extension                               |
| `src/gql/generated.ts`, `src/ui/gql/`      | Generated GraphQL types (do not hand-edit)                         |

The only plugin with unit specs today; it has no `e2e/` directory.

### `packages/product-import-export-plugin` — `@haus-tech/product-import-export-plugin`

Bulk import/export of products via CSV: validation, custom fields, assets, facets, variants; pluggable local/object-storage strategies; Admin UI + Dashboard; optional completion email. License MIT. `peerDependencies`: `@vendure/core ^3.6.0`, `@vendure/email-plugin ^3.6.0` (optional), `csv-parse`, `csv-stringify`, `slug`. Runtime `dependencies`: `@aws-sdk/client-s3`, `axios`, `bottleneck`, `fs-extra`, `lodash`.

| Path                                                                         | Purpose                                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/product-import-export.plugin.ts`                                        | Plugin definition; resolves storage strategies via DI factories, adds an internal `Asset.hash` custom field |
| `src/api/`                                                                   | NestJS controllers: `product-import`, `product-export`, `plugin`             |
| `src/services/product-import.service.ts`                                     | Import orchestration                                                        |
| `src/services/extended-fast-importer.service.ts`                             | Extended Vendure FastImporter                                               |
| `src/services/product-export.service.ts` / `product-export-queue.service.ts` | Export + async export job queue                                             |
| `src/services/import-storage/`                                               | Import job storage strategies (interface, local, S3)                        |
| `src/services/export-storage/`                                               | Export storage strategies (interface, local, S3)                            |
| `src/providers/import-providers/`                                            | CSV parser, product importer, asset importer                                |
| `src/helpers/`                                                               | Shared import/export helpers                                                |
| `src/events/` + `src/handlers/`                                              | `product-exported` event + handler                                          |
| `src/email.ts` + `src/email-templates/`                                      | Export-complete email entry (subpath export `./email`) + template           |
| `src/ui/` / `src/dashboard/`                                                 | Angular Admin UI (route `product-importer`) + React Dashboard (with locales) |
| `assets/`                                                                    | Static assets synced to the public docs site                                |
| `e2e/`                                                                       | `product-import-export-plugin.e2e-spec.ts`, `rest-api-security.e2e-spec.ts` + fixtures |

This is the only plugin exposing **REST controllers** rather than only GraphQL; `rest-api-security.e2e-spec.ts` guards their authorization.

## Where to change what

| Task                                   | Start here                                                      |
| -------------------------------------- | --------------------------------------------------------------- |
| Change a plugin's behavior             | `packages/<plugin>/src/services/` (or `src/service/`), `src/api/` |
| Change a plugin's public API           | `packages/<plugin>/src/index.ts` (+ `package.json` `exports`)    |
| Add Admin UI / Dashboard feature       | `packages/<plugin>/src/ui/` or `src/dashboard/`                 |
| Change supported Vendure version       | plugin `package.json` `peerDependencies` + plugin `compatibility` + README |
| Add a new plugin                       | new `packages/<name>/` with `project.json` + `package.json`      |
| Storage backend (import/export plugin) | `packages/product-import-export-plugin/src/services/{import,export}-storage/` |
| Badge inheritance / channel scoping    | `packages/badge-plugin/src/service/badge.service.ts`             |

## Tests

- Unit specs: `packages/<plugin>/src/**/*.spec.ts`, run by each plugin's `vitest.config.ts` via the Nx `test` target. Only `elastic-search-synonyms` has any today.
- E2E specs: `packages/**/*.e2e-spec.ts`, run by the root `vitest.config.ts` (`badge-plugin/e2e/`, `product-import-export-plugin/e2e/`).
- Every project sets `passWithNoTests: true` — a green `yarn test` does not imply coverage.
- `node_modules` is not committed; `yarn install` is required before running tests locally.
