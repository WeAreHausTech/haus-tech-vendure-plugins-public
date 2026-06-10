# Scope

## In-scope files and dirs

- `package.json` (root and workspace packages) — dependencies, scripts, workspaces field
- `yarn.lock` / `pnpm-lock.yaml` — deterministic lockfiles (do not edit manually)
- `.yarnrc.yml` — Yarn 4 configuration (nodeLinker, plugins, npmRegistryServer, pnpMode)
- `pnpm-workspace.yaml` — pnpm workspace glob definitions
- `.npmrc` — registry auth, scoped registry config (pnpm reads this)
- `.pnp.cjs`, `.pnp.loader.mjs` — Yarn PnP manifests (generated, do not edit)
- `.yarn/` — Yarn 4 cache, releases, plugins, sdks
- `patches/` — `patch-package` or Yarn patch: entries

## Stack boundaries

- Yarn 4: PnP mode vs `node-modules` linker; Zero-Installs caching; Corepack version pinning
- pnpm 8/9: `shamefully-hoist`, `public-hoist-pattern`, workspace protocol (`workspace:*`)
- Workspace management: adding/removing packages, cross-package dependencies
- Not in scope: package contents/feature implementation
- Not in scope: npm-managed projects (no `yarn.lock` or `pnpm-lock.yaml`)

## Triggers

- Adding, removing, or upgrading a dependency
- Adding a new workspace package
- Changing `nodeLinker` in `.yarnrc.yml` (PnP ↔ node-modules)
- Adding or removing a `patch:` entry in `package.json`
- Changing `pnpm-workspace.yaml` glob patterns
- Pinning or upgrading package manager version via Corepack
- Adding scoped registry or auth token configuration
