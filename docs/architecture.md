# Architecture

This repo ships **Vendure plugin libraries**, not a running service. "Architecture" here means how each plugin extends a host Vendure application and which external systems it integrates with at runtime (inside the host app, not this repo).

## Runtime model

- No process runs from this repo. Plugins are imported into a consuming Vendure app's `plugins: []` and execute inside that app's **server** and **worker** processes.
- The Nx monorepo's only runtime concerns are build, test, and release (see [deployment.md](deployment.md)).

## Vendure plugin shape

Each plugin is a class decorated with `@VendurePlugin` (`src/<name>.plugin.ts`) declaring some combination of:

- `imports` / `providers` / `controllers` — NestJS DI wiring and HTTP controllers.
- `entities` — TypeORM entities (`Badge`, `SynonymGroup`).
- `adminApiExtensions` / `shopApiExtensions` — GraphQL schema + resolvers added to the Admin API and (badge-plugin only) the Shop API.
- `configuration(config)` — mutates the host Vendure config (e.g. the import/export plugin pushes an internal `Asset.hash` custom field).
- `dashboard` / `static ui` — React Dashboard extension and Angular Admin UI extension.
- `compatibility` — the supported Vendure range, enforced by Vendure at host bootstrap.
- `static init(options)` — configures the plugin and returns the class.

The public, importable surface of each package is re-exported from `src/index.ts` (the package `main`/`types`).

## Integration boundaries

| Plugin                       | External system          | Configured by                                                                                                                                                                                              |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| badge-plugin                 | None beyond the host DB  | `BadgePlugin.init({ availablePositions })`. Badges live in the host database and are scoped to channels via Vendure's `ChannelService`; no outbound calls.                                                    |
| elastic-search-synonyms      | Elasticsearch (8.x/9.x)  | The host app's Elasticsearch connection; uses the ES **Synonyms API**. Index config helpers in `src/elasticsearch/default-settings.ts`. Syncs at application bootstrap and on every change.                    |
| product-import-export-plugin | Object storage           | Pluggable storage strategies — `LocalExportStorageStrategy` / `LocalImportJobStorageStrategy` (default, under `process.cwd()/static`) or the S3 strategies; selected via `ProductImportExportPlugin.init({ importOptions, exportOptions })`, including a `storageStrategyFactory` for DI-resolved strategies. |
| product-import-export-plugin | Email (optional)         | `@vendure/email-plugin` is an **optional** peer; export-complete email template under `src/email-templates/`, entry point exposed at the `./email` subpath export.                                            |

Connection strings, credentials, and endpoints for these systems are owned by the consuming Vendure app — this repo neither reads nor ships them.

## API surface types

- **GraphQL** — all three plugins extend the Admin API; badge-plugin also extends the Shop API with field resolvers on `Product`, `ProductVariant`, and `SearchResult`.
- **REST** — only `product-import-export-plugin` registers NestJS controllers (`src/api/*.controller.ts`). These are HTTP endpoints on the host app, so their authorization is the plugin's responsibility; `e2e/rest-api-security.e2e-spec.ts` guards it. Treat any change to those controllers as security-relevant.

## Request / job flow (import/export plugin)

1. Admin UI / Dashboard calls a NestJS controller (`src/api/*.controller.ts`).
2. The service layer (`src/services/`) performs the import/export, using the extended FastImporter and the CSV providers.
3. Exports run as async jobs (`product-export-queue.service.ts`) in the host's **worker** process, persisting output via the selected export storage strategy.
4. On completion a `product-exported` event fires; the handler can send the export-complete email.

## Schema evolution

Plugins that add entities (`Badge`, `SynonymGroup`) rely on the **host app's** Vendure/TypeORM migration tooling — there is no migration runner in this repo. Adding or changing an entity field is therefore a breaking change for hosts until they generate a migration; call it out in the plugin changelog. Plugins declare supported Vendure versions via `peerDependencies` plus the plugin `compatibility` range (see [deployment.md](deployment.md)).
