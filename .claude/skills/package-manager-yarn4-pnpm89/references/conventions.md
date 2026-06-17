## Naming conventions

- Workspace package names: follow root naming convention (e.g. `@scope/package-name`)
- Patch files: `patches/<package-name>@<version>.patch` in root `patches/` directory
- `.yarnrc.yml` (Yarn 4): `nodeLinker`, `yarnPath`, and `plugins` entries
- `.npmrc` (pnpm): `shamefully-hoist`, `strict-peer-dependencies`, workspace catalog entries
- `packageManager` field in root `package.json`: pinned with exact version via corepack (e.g. `"yarn@4.5.0"`)

## Do / don't

DO: Use `workspace:*` (or `workspace:^`) protocol for all internal package dependencies — DON'T: use a fixed version number for workspace deps (breaks in-repo resolution)
DO: Pin the package manager version in `package.json#packageManager` and use `corepack` to enforce it — DON'T: rely on globally installed package manager versions that differ per developer
DO: Commit the lockfile (`yarn.lock` / `pnpm-lock.yaml`) on every dependency change — DON'T: add lockfiles to `.gitignore`
DO: Use `pnpm catalog:` entries for shared dependency version management in pnpm v9+ workspaces — DON'T: duplicate version strings across multiple `package.json` files
DO: Run install (`yarn install` / `pnpm install`) after any `package.json` change to keep lockfile in sync — DON'T: edit `package.json` without refreshing the lockfile
DO: Use `--frozen-lockfile` (pnpm) or `--immutable` (Yarn 4) in all CI install steps — DON'T: allow CI to silently update the lockfile during install

## Forbidden patterns

NEVER: `npm install` in a Yarn or pnpm workspace — overwrites lockfile with wrong format
NEVER: Manual edits to `yarn.lock` or `pnpm-lock.yaml` — breaks integrity checksums
NEVER: Change `nodeLinker` in `.yarnrc.yml` without a full `yarn install` and CI validation — breaks module resolution silently
NEVER: `--frozen-lockfile` / `--immutable` skipped in CI — allows lockfile drift between branches
NEVER: Publish a workspace package while still referencing `workspace:*` in its `dependencies` — published package becomes uninstallable by consumers
NEVER: `--ignore-scripts` in install without documented reason — may silently skip required postinstall build steps
