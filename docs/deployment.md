# Deployment

"Deployment" for this repo means **publishing plugin packages to npm** and syncing plugin markdown to the public docs site. There is no server deploy.

## What is published

Three public npm packages under the `@haus-tech/` scope, built to `dist/packages/<plugin>/`:

- `@haus-tech/badge-plugin`
- `@haus-tech/elastic-search-synonyms`
- `@haus-tech/product-import-export-plugin`

`nx.json` sets the publish `packageRoot` to `dist/packages/{projectName}` with `access: public`.

## Versioning convention

Plugin versions track the supported **Vendure major.minor** (e.g. Vendure 3.6.x → plugin `3.6.x`), where the patch segment is a build number. Only major+minor are taken from Vendure. See [README.md](../README.md) ("Package versioning").

> CONFIRM-WITH-TEAM: `badge-plugin` is at `4.0.x` while the repo targets Vendure `3.6.3`, so it does not follow this convention. Confirm whether badge-plugin is intentionally versioned independently and document the exception (or realign it).

## Releasing with Nx Release

Releases are **manual / developer-driven — there is no publish workflow in this repo.** Run from the repo root:

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
- `preVersionCommand` runs affected `test` + affected `build` and `yarn update-readmes` before versioning.
- Derives version bump + changelog per project from Conventional Commits; current version resolved from git tags (fallback: disk).
- Per-project changelogs render through `scripts/no-next-changelog-renderer.cjs`, which filters `next` prereleases out of `CHANGELOG.md`.
- Updates `package.json` versions in both `dist/packages/<name>` and `packages/<name>`, commits, tags, and pushes.

Publish credentials are read from the `NODE_AUTH_TOKEN` environment variable (see `.npmrc` / `.yarnrc.yml`) and live with the npm account — never in the repo.

## CI workflows

GitHub Actions in this repo handle **docs sync only** — no lint, no build, no test, no audit, no npm publish.

| Workflow            | Trigger                                                                                                                  | Does                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync-markdown.yml` | push to `main` touching `packages/**/*.md` or `packages/**/assets/**`; manual dispatch (with an optional full-sync input) | Installs with `--immutable --check-cache`, runs `yarn update-readmes`, then copies changed plugin markdown and assets into the public docs site repo and commits there |

The workflow prunes docs for plugins and markdown files that no longer exist, so deleting a plugin markdown file here removes it from the docs site on the next run.

> Because no workflow runs the test or lint targets, **a red build can reach `main`.** Treat the local checks in [development-workflow.md](development-workflow.md) as the only gate.

## Post-release verification

- Confirm the new git tag `<plugin>@<version>` exists.
- Confirm the version is visible on npm.
- Confirm the plugin README version line and `CHANGELOG.md` reflect the new version.

## Rollback

There is no formal rollback procedure. For an npm package, deprecate the bad version and publish a fixed patch — never rewrite published history or unpublish a version other consumers may already depend on.
