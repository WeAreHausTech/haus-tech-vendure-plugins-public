# Conventions

Patterns specific to this monorepo of Vendure plugin libraries.

## Plugin / extension pattern

- One npm package per `packages/<name>/`. The plugin class lives in `src/<name>.plugin.ts` and is decorated with `@VendurePlugin`.
- The package's public surface is whatever `src/index.ts` re-exports; this is the package `main`/`types`. Keep `index.ts` curated — only export the intended public API.
- A new plugin mirrors the existing layout: `src/`, `project.json` (Nx targets: `build`, `test`, `lint`, `upgrade:vendure`, `version`, `update-readme`), `package.json`, `README.md`, `CHANGELOG.md`, `tsconfig*.json`, `vitest.config.ts`.
- Plugin options are passed via `static init(options)`; defaults are merged in `init`/`constants.ts`.

## Admin UI vs Dashboard

Each plugin ships **two** front-end extensions:

- `src/ui/` — legacy Angular Admin UI extension (`static ui: AdminUiExtension`, routes, `translations/en.json`+`sv.json`).
- `src/dashboard/` — new Vendure Dashboard (React) extension (`dashboard: './dashboard/index.tsx'`).

When changing UI behavior, decide whether the change belongs to the Angular admin UI, the React Dashboard, or both.

## Configuration vs code

- Runtime configuration (Elasticsearch connection, S3 credentials, email) is supplied by the **consuming Vendure app** and via `Plugin.init(...)` options — not by env files in this repo.
- The import/export plugin injects an internal `Asset.hash` custom field via its `configuration(config)` hook; it is `internal: true`.

## Generated artifacts

| Artifact                                  | Regenerate with                                | Do not                |
| ----------------------------------------- | ---------------------------------------------- | --------------------- |
| GraphQL types (`src/gql/`, `src/ui/gql/`) | GraphQL codegen (run manually; no root script) | hand-edit             |
| Plugin README version line                | `yarn update-readmes`                          | hand-edit the version |

## Versioning & commits

- **Conventional Commits** are required — they drive `nx release` version bumps and changelogs (`feat`, `fix`, `perf` appear in changelogs).
- Plugin versions follow supported Vendure **major.minor** (see [deployment.md](deployment.md)).
- Releases are independent per project; never hand-bump all plugins together — use `nx release`.

## Common change recipes

| Task                                  | Start here                                          | Also touch                                    |
| ------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| Add/modify plugin behavior            | `packages/<plugin>/src/services/`                   | tests (`*.spec.ts`), `index.ts` if API-facing |
| Expose new public export              | `packages/<plugin>/src/index.ts`                    | `package.json` `exports` if a new subpath     |
| Bump supported Vendure version        | `packages/<plugin>/package.json` `peerDependencies` | plugin README compatibility section           |
| Add Admin GraphQL field               | `src/api/api-extensions.ts` + resolver              | regenerate GraphQL types                      |
| Add a storage backend (import/export) | `src/services/{import,export}-storage/`             | `index.ts` export, plugin `init` wiring       |
| Add a new plugin                      | new `packages/<name>/` with `project.json`          | root scripts already fan out via `--all`      |
