# Setup

Local setup for building and testing the plugin libraries. No Vendure server or `.env` is required for library work — these are published npm packages, not an app.

## Prerequisites

- Node `>=20` (CI uses Node 22).
- **Yarn 4** via Corepack: `corepack enable` (the repo pins `yarn@4.15.0` in `package.json`).
- Git.

## Related systems

None required locally to build/test the libraries. Plugins integrate with Elasticsearch and S3/email **inside a consuming Vendure app**, not here (see [architecture.md](architecture.md)).

## Install

```bash
corepack enable
yarn install            # installs all packages/* workspaces
```

> `node_modules` is not committed; run `yarn install` before building or testing.

## Build / test / lint

Run from the repo root (Nx fans out across `packages/*`):

```bash
yarn build      # build all plugins
yarn test       # unit tests for all plugins
yarn lint       # lint all plugins
```

Single project: `npx nx <target> <project>` (e.g. `npx nx test product-import-export-plugin`). See [development-workflow.md](development-workflow.md) for `:affected` variants and generated artifacts.

## Environment

No `.env.example` exists in this repo and none is needed for library development. Runtime configuration (Elasticsearch connection, S3 credentials, email) belongs to the consuming Vendure app.

Releases are run **manually** via `nx release` (no CI publish pipeline); the npm publish token lives in the npm (npmjs.com) account/dashboard, not in the repo. Do not commit tokens.

## Verify

- `yarn build` produces `dist/packages/<plugin>/`.
- `yarn test` reports passing (or "no tests") for each plugin.
- `npx nx show projects` lists the plugin projects.

## Troubleshooting

- **Wrong Yarn version / immutable install fails:** run `corepack enable && corepack prepare yarn@4.15.0 --activate`.
- **Stale Nx cache:** `npx nx reset`.
- **Clean node_modules:** `yarn remove-node-modules` then `yarn install`.
