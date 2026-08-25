# Conventions

Patterns specific to this monorepo of Vendure plugin libraries.

## Plugin / extension pattern

- One npm package per `packages/<name>/`. The plugin class lives in `src/<name>.plugin.ts` and is decorated with `@VendurePlugin`.
- The package's public surface is whatever `src/index.ts` re-exports; this is the package `main`/`types`. Keep `index.ts` curated — only export the intended public API.
- A new plugin mirrors the existing layout: `src/`, `project.json` (Nx targets: `build`, `test`, `lint`, `upgrade:vendure`, `version`, `update-readme`), `package.json`, `README.md`, `CHANGELOG.md`, `tsconfig*.json`, `eslint.config.cjs`, `vitest.config.ts`.
- Plugin options are passed via `static init(options)`; the injection token lives in `src/constants.ts` and is provided through a `useFactory` reading the static options.
- Declare the supported Vendure range in **two** places that must agree: the plugin's `compatibility` field and `package.json` `peerDependencies`.
- Service directory naming is inconsistent across plugins — `src/services/` in two, `src/service/` in `badge-plugin`. Follow whichever the plugin you are editing already uses.

## Admin UI vs Dashboard

Each plugin ships **two** front-end extensions:

- `src/ui/` — Angular Admin UI extension (`static ui: AdminUiExtension`, routes, `translations/en.json` + `sv.json`).
- `src/dashboard/` — Vendure Dashboard (React) extension (`dashboard: './dashboard/index.tsx'`).

When changing UI behavior, decide whether the change belongs to the Angular Admin UI, the React Dashboard, or both. Both are declared as build `assets` in each `project.json`, so a new UI subdirectory needs a matching assets entry or it will not be published.

Translations are maintained in **en** and **sv**; add both keys when adding a string.

## Configuration vs code

- Runtime configuration (Elasticsearch connection, object-storage credentials, email transport) is supplied by the **consuming Vendure app** and via `Plugin.init(...)` options — never by env files in this repo.
- The import/export plugin injects an internal `Asset.hash` custom field via its `configuration(config)` hook; it is `internal: true`.
- Storage strategies are resolved through DI factories, so a host can pass either a strategy instance (`storageStrategy`) or a factory receiving an `Injector` (`storageStrategyFactory`).

## Generated artifacts

| Artifact                                  | Regenerate with                        | Do not                |
| ----------------------------------------- | -------------------------------------- | --------------------- |
| GraphQL types (`src/gql/`, `src/ui/gql/`) | GraphQL codegen — see the note below   | hand-edit             |
| Plugin README version line                | `yarn update-readmes`                  | hand-edit the version |

> CONFIRM-WITH-TEAM: the generated GraphQL files are committed, but no codegen config or script exists anywhere in this repo, so the regeneration command cannot be derived from the code. Confirm it and record it in [development-workflow.md](development-workflow.md).

## Versioning & commits

- **Conventional Commits** are required — they drive `nx release` version bumps and changelogs (`feat`, `fix`, `perf` appear in changelogs; `next` prereleases are filtered out by `scripts/no-next-changelog-renderer.cjs`).
- Plugin versions follow the supported Vendure **major.minor** (see [deployment.md](deployment.md)), with `badge-plugin` currently an unexplained exception.
- Releases are independent per project; never hand-bump versions — use `nx release`.

## Public-repository hygiene

This repo is public. Code, docs, commit messages, changelogs, and test fixtures must contain no customer names, internal hostnames or URLs, credentials, or internal-only process detail. Describe capability generically where a concrete internal example would otherwise be tempting.

## Quality gates are local only

There is no pre-commit hook and no CI workflow running lint, build, test, or audit — see [development-workflow.md](development-workflow.md). Running the checks before pushing is a convention here, not something enforced by tooling.

## Common change recipes

| Task                                  | Start here                                          | Also touch                                       |
| ------------------------------------- | --------------------------------------------------- | ------------------------------------------------ |
| Add/modify plugin behavior            | `packages/<plugin>/src/services/` or `src/service/` | tests (`*.spec.ts`), `index.ts` if API-facing     |
| Expose new public export              | `packages/<plugin>/src/index.ts`                    | `package.json` `exports` if a new subpath         |
| Bump supported Vendure version        | `packages/<plugin>/package.json` `peerDependencies` | plugin `compatibility`, README compatibility note |
| Add an Admin GraphQL field            | `src/api/api-extensions.ts` + resolver              | regenerate GraphQL types                          |
| Add a Shop API field (badge-plugin)   | `src/api/api-extensions.ts` + `src/api/shop.resolver.ts` | regenerate GraphQL types                     |
| Change a REST endpoint (import/export)| `src/api/*.controller.ts`                           | `e2e/rest-api-security.e2e-spec.ts` — authorization is the plugin's job |
| Add a storage backend (import/export) | `src/services/{import,export}-storage/`             | `index.ts` export, plugin `init` wiring           |
| Add a new plugin                      | new `packages/<name>/` with `project.json`          | root scripts already fan out via `--all`          |
