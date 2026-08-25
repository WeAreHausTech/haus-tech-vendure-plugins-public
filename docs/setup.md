# Setup

Local setup for building and testing the plugin libraries. No Vendure server and no `.env` are required for library work — these are published npm packages, not an app.

## Prerequisites

- Node `>=20` (each plugin's `package.json` sets `engines.node`; the docs-sync workflow uses Node 22).
- **Yarn 4** via Corepack: `corepack enable` (the repo pins `yarn@4.15.0` in `package.json` and ships the release in `.yarn/releases/`).
- Git.

## Related systems

None required locally to build or test the libraries. Plugins integrate with Elasticsearch, object storage, and email **inside a consuming Vendure app**, not here (see [architecture.md](architecture.md)).

## Install

```bash
corepack enable
yarn install            # installs all packages/* workspaces
```

> `node_modules` is not committed; run `yarn install` before building or testing.

Yarn is configured in hardened mode (`.yarnrc.yml`): `enableHardenedMode: true`, `checksumBehavior: throw`, `enableScripts: false`, and a minimum package-age gate (`npmMinimalAgeGate`). A brand-new upstream release can therefore be refused until it ages past the gate — that is intentional, not a broken install.

## Build / test / lint

Run from the repo root (Nx fans out across `packages/*`):

```bash
yarn build            # build all plugins
yarn test             # tests for all plugins
yarn lint             # lint all plugins
yarn security:audit   # yarn npm audit, high severity, production deps
```

Single project: `npx nx <target> <project>` (e.g. `npx nx test product-import-export-plugin`). See [development-workflow.md](development-workflow.md) for `:affected` variants and generated artifacts.

## Environment

No `.env.example` exists in this repo and none is needed for library development. Runtime configuration (Elasticsearch connection, object-storage credentials, email transport) belongs to the consuming Vendure app and is passed through each plugin's `init(...)` options.

`NODE_AUTH_TOKEN` is the only credential this repo references — `.npmrc`/`.yarnrc.yml` read it from the environment for registry access. Never commit a value for it.

Releases are run **manually** via `nx release`; there is no publish pipeline in this repo. Publish credentials live with the npm account, not in the repo.

## Verify

- `yarn build` produces `dist/packages/<plugin>/`.
- `yarn test` reports passing (or "no tests" — several projects pass with none) for each plugin.
- `npx nx show projects` lists `badge-plugin`, `elastic-search-synonyms`, and `product-import-export-plugin`.

## Troubleshooting

- **Wrong Yarn version / immutable install fails:** `corepack enable && corepack prepare yarn@4.15.0 --activate`.
- **Install refuses a dependency as too new:** the `npmMinimalAgeGate` in `.yarnrc.yml` is holding it back — wait it out or pin a released version rather than disabling the gate.
- **Checksum mismatch on install:** `checksumBehavior: throw` is deliberate. Investigate the dependency change; do not relax the setting to get past it.
- **Stale Nx cache:** `npx nx reset`.
- **Clean node_modules:** `yarn remove-node-modules` then `yarn install`.
