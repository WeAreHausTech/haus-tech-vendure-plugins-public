# Deployment

"Deployment" for this repo means **publishing plugin packages to npm** and syncing docs. There is no server deploy.

## What is published

Two public npm packages under the `@haus-tech/` scope, built to `dist/packages/<plugin>/`:

- `@haus-tech/elastic-search-synonyms`
- `@haus-tech/product-import-export-plugin`

`nx.json` sets the publish `packageRoot` to `dist/packages/{projectName}` with `access: public`.

## Versioning convention

Plugin versions track the supported **Vendure major.minor** (e.g. Vendure 3.6.x → plugin `3.6.x`), where the patch segment is a build number. Only major+minor are taken from Vendure. See [README.md](../README.md) ("Package versioning").

## Releasing with Nx Release

Releases are **manual / developer-driven** (no auto-publish CI workflow in this repo). Run from the repo root:

```bash
# preview first
npx nx release --dry-run
# or per project
npx nx release --projects=elastic-search-synonyms --dry-run

# then release
npx nx release
```

What `nx release` does (config in `nx.json` → `release`):

- Independent projects (`projectsRelationship: independent`); git tag pattern `{projectName}@{version}`.
- `preVersionCommand` runs affected `test` + `build` before versioning.
- Derives version bump + changelog per project from Conventional Commits; current version resolved from git tags (fallback: disk).
- Updates `package.json` versions in both `dist/packages/<name>` and `packages/<name>`, commits, tags, and (per README) pushes and publishes.

Releases are run **manually** via `nx release` (no CI publish pipeline). The npm publish token lives in the npm (npmjs.com) account/dashboard — it is **not** stored in the repo.

## CI workflows

GitHub Actions (`.github/workflows/`) handle docs, not npm publish:

| Workflow             | Trigger                                              | Does                                                                 |
| -------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| `update-readmes.yml` | push to `main` touching `packages/**/package.json`   | Runs `yarn update-readmes`, audits deps, commits README version bumps |
| `sync-markdown.yml`  | push to `main` touching `packages/**` md/mdx/assets  | Audits deps, updates READMEs, syncs plugin markdown/assets to `wearehaustech.github.io/docs/vendure-plugins` |

Both run `yarn npm audit --severity high --recursive` and use the `NODE_AUTH_TOKEN` secret for install.

## Post-release verification

- Confirm new git tag `<plugin>@<version>` exists.
- Confirm the version is visible on npm.
- Confirm plugin README/changelog reflect the new version.

## Rollback

There is no formal rollback procedure. For an npm package, deprecate the bad version and publish a fixed patch (never rewrite published history).
