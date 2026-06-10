# Architecture

This repo ships **Vendure plugin libraries**, not a running service. "Architecture" here means how each plugin extends a host Vendure application and which external systems it integrates with at runtime (inside the host app, not this repo).

## Runtime model

- No process runs from this repo. Plugins are imported into a consuming Vendure app's `plugins: []` and execute inside that app's **server** and **worker** processes.
- The Nx monorepo's only runtime concerns are build, test, and release (see [deployment.md](deployment.md)).

## Vendure plugin shape

Each plugin is a class decorated with `@VendurePlugin` (`src/<name>.plugin.ts`) declaring some combination of:

- `imports` / `providers` / `controllers` — NestJS DI wiring and HTTP controllers.
- `entities` — TypeORM entities (e.g. `SynonymGroup`).
- `adminApiExtensions` — GraphQL schema + resolvers added to the Admin API.
- `configuration(config)` — mutates the host Vendure config (e.g. the import/export plugin pushes an internal `Asset.hash` custom field).
- `dashboard` / `static ui` — React Dashboard extension and Angular Admin UI extension.
- `static init(options)` — configures the plugin and returns the class.

The public, importable surface of each package is re-exported from `src/index.ts` (the package `main`/`types`).

## Integration boundaries

| Plugin                        | External system | Configured by                                                                 |
| ----------------------------- | --------------- | ----------------------------------------------------------------------------- |
| elastic-search-synonyms       | Elasticsearch (8.x/9.x) | Host app's Elasticsearch connection; uses the ES **Synonyms API**. Index config helpers in `src/elasticsearch/default-settings.ts`. Syncs on `onApplicationBootstrap` and on every change. |
| product-import-export-plugin  | Object storage  | Pluggable storage strategies — `LocalExportStorageStrategy`/`LocalImportJobStorageStrategy` (default, under `process.cwd()/static`) or S3 strategies; selected via `ProductImportExportPlugin.init({ importOptions, exportOptions })`. |
| product-import-export-plugin  | Email (optional)| `@vendure/email-plugin` is an **optional** peer; export-complete email template under `src/email-templates/`. |

The exact Elasticsearch connection/auth env vars are owned by the consuming Vendure app, not this plugin library.

## Request / job flow (import/export plugin)

1. Admin UI / Dashboard calls a NestJS controller (`src/api/*.controller.ts`).
2. Service layer (`src/services/`) performs import/export, using the extended FastImporter and CSV providers.
3. Exports run as async jobs (`product-export-queue.service.ts`), persisting output via the selected export storage strategy.
4. On completion a `product-exported` event fires; the handler can send the export-complete email.

## Schema evolution

Plugins that add entities (e.g. `SynonymGroup`) rely on the **host app's** Vendure/TypeORM migration tooling — there is no migration runner in this repo. Plugins declare supported Vendure versions via `peerDependencies` and the version-pinning convention (see [deployment.md](deployment.md)).
