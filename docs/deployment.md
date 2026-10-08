# Deployment

"Deployment" for this repo means **publishing plugin packages to npm** and syncing plugin markdown to the public docs site. There is no server deploy.

## What is published

Four public npm packages under the `@haus-tech/` scope, built to `dist/packages/<plugin>/`:

- `@haus-tech/badge-plugin`
- `@haus-tech/dashboard-locale-plugin`
- `@haus-tech/elastic-search-synonyms`
- `@haus-tech/product-import-export-plugin`

`nx.json` sets the publish `packageRoot` to `dist/packages/{projectName}` with `access: public`.

## Versioning convention

Plugin versions track the supported **Vendure major.minor** (e.g. Vendure 3.6.x → plugin `3.6.x`), where the patch segment is a build number. Only major+minor are taken from Vendure. See [README.md](../README.md) ("Package versioning").

> CONFIRM-WITH-TEAM: `badge-plugin` is at `4.0.x` while the repo targets Vendure `3.6.3`, so it does not follow this convention. Confirm whether badge-plugin is intentionally versioned independently and document the exception (or realign it).

## Releasing with Nx Release

Versioning is developer-driven and runs locally; **publishing runs in GitHub Actions** (`release.yml`) with npm trusted publishing (OIDC), so no npm token or OTP is involved. Run from the repo root:

```bash
# preview first
npx nx release --skip-publish --dry-run
# or per project
npx nx release --projects=elastic-search-synonyms --skip-publish --dry-run

# then version, commit, tag and push; the pushed tag triggers release.yml
npx nx release --skip-publish
```

What `nx release` does (config in `nx.json` → `release`):

- Independent projects (`projectsRelationship: independent`); git tag pattern `{projectName}@{version}`.
- `preVersionCommand` runs affected `test` + affected `build` and `yarn update-readmes` before versioning.
- Derives version bump + changelog per project from Conventional Commits; current version resolved from git tags (fallback: disk).
- Per-project changelogs render through `scripts/no-next-changelog-renderer.cjs`, which filters `next` prereleases out of `CHANGELOG.md`.
- Updates `package.json` versions in both `dist/packages/<name>` and `packages/<name>`, commits, tags, and pushes.

`release.yml` then builds the tagged project and runs `nx release publish` for it. Nx publishes through `npm publish` (also with Yarn 4), and npm (>= 11.5.1) exchanges the workflow's OIDC token for a short-lived publish token and adds provenance. Each package needs this repo and `release.yml` registered as its Trusted Publisher on npmjs.com, and a brand-new package must be published once by hand before that setting exists. `release.yml` can also be started manually with a comma-separated `projects` input; versions already on npm are skipped.

`.npmrc` / `.yarnrc.yml` still read an optional `NODE_AUTH_TOKEN` for a manual first publish from a developer machine; it is never stored in the repo.

## CI workflows

GitHub Actions in this repo handle docs sync and npm publishing — no lint, no test, no audit.

| Workflow            | Trigger                                                                                                                  | Does                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release.yml`       | push of a `<project>@<version>` tag; manual dispatch (optional `projects` input)                                          | Builds the project(s) and runs `nx release publish` with npm trusted publishing (OIDC); needs `id-token: write`                                                         |
| `sync-markdown.yml` | push to `main` touching `packages/**/*.md` or `packages/**/assets/**`; manual dispatch (with an optional full-sync input) | Installs with `--immutable --check-cache`, runs `yarn update-readmes`, then copies changed plugin markdown and assets into the public docs site repo and commits there |

The workflow prunes docs for plugins and markdown files that no longer exist, so deleting a plugin markdown file here removes it from the docs site on the next run.

> Because no workflow runs the test or lint targets, **a red build can reach `main`.** Treat the local checks in [development-workflow.md](development-workflow.md) as the only gate.

## Post-release verification

- Confirm the new git tag `<plugin>@<version>` exists.
- Confirm the version is visible on npm.
- Confirm the plugin README version line and `CHANGELOG.md` reflect the new version.

## Rollback

There is no formal rollback procedure. For an npm package, deprecate the bad version and publish a fixed patch — never rewrite published history or unpublish a version other consumers may already depend on.
