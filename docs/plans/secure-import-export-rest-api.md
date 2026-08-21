# Plan: Secure the product-import-export-plugin REST API

**Repo:** WeAreHausTech/haus-tech-vendure-plugins-public
**Package:** `@haus-tech/product-import-export-plugin`
**Branches:** `main` (3.6.x) and `fix/3.5-polling-and-featured-asset` (3.3.x, pinned by bov-ecom)
**Status:** Draft v2 (Fable-reviewed 2026-08-20), awaiting user OK

## Background

The plugin's entire REST surface ships without any `@Allow()` decorators. Vendure's
global `AuthGuard` returns `true` for any handler without permission metadata
(`auth-guard.js`: `if (authDisabled || !permissions || isPublic) return true`), so
every endpoint is publicly reachable. Verified live (unauthenticated curl, 200 OK):

- `GET /product-import-export/config` → full plugin options incl. AWS
  `accessKeyId`/`secretAccessKey` (prod + staging on pim.bad-varme.se)
- `GET /product-import-export/channel` → full channel object (staging)
- `GET /product-export/exported-files` → 200 `[]` (staging)

Beyond the credential leak, `POST /product-import/upload` allows unauthenticated
catalog writes and `DELETE /product-export/delete/:fileName` unauthenticated file
deletion.

Decisions taken by user 2026-08-20:
- Scope: all endpoints in all three controllers.
- Permissions: catalog-based, read/write split, using `@Allow()` OR-semantics.
- 3.5-line release: promote to stable `3.3.11` (ends the `-next` track).
- AWS key rotation for `bov-assets` / `bov-assets-staging` is handled by Tim,
  outside this plan.

## Permission matrix

| Controller | Endpoint | Permission (`@Allow`, OR) |
|---|---|---|
| plugin.controller | `GET /product-import-export/config` | `ReadCatalog, ReadProduct` |
| plugin.controller | `GET /product-import-export/channel` | `ReadCatalog, ReadProduct` |
| product-import.controller | `POST /product-import/upload` | `UpdateCatalog, UpdateProduct` |
| product-export.controller | `POST /product-export/export` | `UpdateCatalog, UpdateProduct` |
| product-export.controller | `POST /product-export/export-all` | `UpdateCatalog, UpdateProduct` |
| product-export.controller | `GET /product-export/download/:fileName` | `ReadCatalog, ReadProduct` |
| product-export.controller | `DELETE /product-export/delete/:fileName` | `UpdateCatalog, UpdateProduct` |
| product-export.controller | `POST /product-export/custom-fields` | `ReadCatalog, ReadProduct` (read-only despite POST) |
| product-export.controller | `GET /product-export/exported-files` | `ReadCatalog, ReadProduct` |

Rationale: matches Vendure's own catalog permissions so existing admin roles that
can read/update products keep working. Guard returns Vendure `ForbiddenError`,
which the core `ExceptionLoggerFilter` maps to HTTP 403 in REST context.

## Task 1 — Filter the /config response (both branches)

**File:** `src/api/plugin.controller.ts`

Replace `return this.options` with an explicit whitelist (defense in depth on top
of auth; the options object must never be serialized raw again):

```ts
getConfig() {
  const { importOptions, exportOptions } = this.options
  return {
    importOptions: {
      visibleOptions: importOptions.visibleOptions,
      // Pick fields explicitly — the ImportOptions type allows storageStrategy /
      // storageStrategyFactory / importJobStorage inside defaultOptions too, so a
      // raw copy of defaultOptions could re-leak credentials (Fable finding #4).
      defaultOptions: {
        updateProductSlug: importOptions.defaultOptions?.updateProductSlug,
        restoreSoftDeleted: importOptions.defaultOptions?.restoreSoftDeleted,
      },
    },
    exportOptions: {
      defaultFileName: exportOptions.defaultFileName,
      exportAssetsAsOptions: exportOptions.exportAssetsAsOptions,
      defaultExportAssetsAs: exportOptions.defaultExportAssetsAs,
      defaultExportFields: exportOptions.defaultExportFields,
      requiredExportFields: exportOptions.requiredExportFields,
      customExportColumns: exportOptions.customExportColumns?.map(({ name }) => ({ name })),
    },
  }
}
```

Never include: `storageStrategy`, `storageStrategyFactory`, `importJobStorage`,
or any nested credentials object.

Consumer compatibility check (verified: all consumers only read whitelisted fields):
- `src/dashboard/import.tsx` → `importOptions.defaultOptions.updateProductSlug`; on main also `importOptions.visibleOptions`
- `src/dashboard/export-dialog.tsx` (on main: `export-configuration-panel.tsx`) → `exportOptions.{customExportColumns[].name, defaultExportAssetsAs, exportAssetsAsOptions, defaultExportFields, requiredExportFields}`; on main also `exportOptions.defaultFileName`
- `src/ui/components/product-import.component.ts` → `data.importOptions`
- `src/ui/product-export.service.ts` → passes through to export dialog component (same exportOptions fields + `visibleOptions`)

Also whitelist the `/channel` response to the fields the UIs actually consume
(`code`, `token`, `defaultLanguageCode`, `availableLanguageCodes` — confirm exact
usage at implementation time). Today it serializes the full Channel entity incl.
`sellerId` and custom fields (Fable finding #11); cheap to close in the same pass.

**Acceptance criteria:**
- Response JSON contains only the fields above.
- `JSON.stringify` of the response does not contain `secretAccessKey`,
  `accessKeyId`, `credentials`, or `storageStrategy` when the plugin is
  initialized with an S3 strategy carrying fake credentials.

**Verification:** e2e test in Task 3; `yarn nx run @haus-tech/product-import-export-plugin:test`.

## Task 2 — Add @Allow() auth to all three controllers (both branches)

**Files:** `src/api/plugin.controller.ts`, `src/api/product-import.controller.ts`,
`src/api/product-export.controller.ts`

- Import `Allow` and `Permission` from `@vendure/core`.
- Apply the permission matrix above, one `@Allow(...)` per handler.
- No `Permission.Public` anywhere in this plugin.

Client-side gap that must be fixed in the same task (otherwise the Angular admin
UI import page breaks):
- `src/ui/components/product-import.component.ts` `ngOnInit` fetches
  `/product-import-export/config` without auth headers. Change it to send
  `...this.getRequestHeaders()` like the other calls in the same file. Note
  ordering: `getRequestHeaders()` reads `this.appConfig`, which is loaded on the
  line above — keep that order.
- Dashboard (`src/dashboard/*.tsx`, exists on **both** branches — Fable finding #5)
  already sends `credentials: 'include'` + channel header on every fetch; with
  cookie-based sessions this is sufficient. Risk noted below for bearer-mode
  dashboards. Smoke-test the dashboard on both branches.

**Acceptance criteria:**
- Unauthenticated request to every endpoint returns 403 (see Task 3).
- Superadmin-authenticated request succeeds on every endpoint.

**Verification:** e2e suite passes; manual dev-server smoke test of admin-ui
import page and dashboard export dialog (`yarn start` in the package).

## Task 3 — e2e tests (both branches)

**File:** `e2e/product-import-export-plugin.e2e-spec.ts` (extend existing suite;
it already boots a real HTTP server on port 3057 and has `adminClient`).

Test harness facts: `testConfig` uses `tokenMethod: 'bearer'`;
`adminClient.getAuthToken()` returns the superadmin token after
`await adminClient.asSuperAdmin()`. Authenticated REST calls:
`fetch(url, { headers: { Authorization: 'Bearer ' + adminClient.getAuthToken() } })`.

New tests:
1. **Credential leak regression (the core proof):** MUST be a new spec file
   `e2e/config-endpoint-security.e2e-spec.ts` on port **3059** (3057/3058 taken,
   spec files run in parallel). A second describe block in an existing file does
   NOT work: `ProductImportExportPlugin.options` is a static read by `useFactory`
   at bootstrap, so the last `init()` in a file wins for every server in that
   file (Fable finding #3). Vitest isolates per spec file, so a separate file is
   safe. Configure `ProductImportExportPlugin.init` with an
   `S3ExportStorageStrategy`/`S3ImportJobStorageStrategy` carrying fake
   credentials (`accessKeyId: 'AKIA_FAKE_E2E'`, `secretAccessKey: 'FAKE_SECRET_E2E'`).
   Authenticated `GET /config` → 200; assert raw body string contains neither
   `FAKE_SECRET_E2E`, `AKIA_FAKE_E2E`, `secretAccessKey`, `accessKeyId`, nor
   `storageStrategy`; assert whitelisted fields are present
   (`customExportColumns` as `[{name}]` only).
2. **Auth enforcement:** for each endpoint in the matrix, unauthenticated fetch →
   403. Parameterized `it.each` over method+path (upload/export need minimal
   bodies; 403 must be returned before body validation since the guard runs first).
3. **Authenticated happy path:** superadmin fetch of `/config`, `/channel`,
   `/exported-files` → 200.
4. Update **all seven** existing unauthenticated REST fetches in
   `product-import-export-plugin.e2e-spec.ts` to send the bearer token — lines
   ~178 (config), ~196 (channel), ~207 (custom-fields), ~224 and ~237
   (export-all validation), ~479 and ~685 (export) — otherwise they fail with
   403 after Task 2 (Fable finding #2). Alternatively use `adminClient.fetch()`
   which already attaches authToken + channelToken.
   `custom-export-columns.e2e-spec.ts` makes no REST calls and needs no change.

**Acceptance criteria:** suite green on both branches:
`yarn nx run @haus-tech/product-import-export-plugin:test`.

## Task 4 — Backport/forward-port and branch mechanics

Both branches have byte-identical `src/api/plugin.controller.ts`; the export
controller differs slightly (main has 15 extra lines) so apply the change as a
patch per branch, not a cherry-pick assumption.

1. Branch off `fix/3.5-polling-and-featured-asset` → `fix/3.5-secure-rest-api`.
   Implement tasks 1–3. PR into `fix/3.5-polling-and-featured-asset`.
2. Branch off `main` → `fix/secure-rest-api`. Same change adapted (dashboard
   files exist here). PR into `main`.
3. Conventional commits: `fix(product-import-export-plugin): require catalog
   permissions on REST API and stop leaking storage credentials in /config`.
   Mark as security fix in changelog/release notes.

Per user rules: implementer may commit/push per task inside the approved plan;
merges are squash (`gh pr merge <nr> --squash --delete-branch`).

## Task 5 — Releases

Release tooling: `nx release` (independent versioning, tag
`{projectName}@{version}`, `preVersionCommand` runs affected tests + build).
No CI release pipeline — releases run locally by user/agent per repo convention
(confirm with user at execution time who runs `nx release`).

- 3.5 line: promote to **stable `3.3.11`** (from `3.3.11-next.1`), published with
  a dedicated dist-tag **`lts-3.3`** — NOT `latest`. npm `latest` is `3.6.2`
  today and nx-release-publish defaults to `latest`, so publishing 3.3.11
  without `--tag` would downgrade `latest` for every unpinned install (Fable
  finding #1, blocker). bov-ecom pins exact versions and is unaffected by the
  tag choice. The promotion intentionally includes the next.0/next.1 content
  (id export field + customExportColumns backport, polling/featured-asset fixes)
  — user accepted this when choosing promotion.
- main: patch release **`3.6.3`** on `latest`.
- Note at execution: `preVersionCommand` runs `nx affected` against base `main`;
  on the 74-commit-diverged 3.5 branch verify it only targets this package.

## Task 6 — Downstream: bov-ecom

- Bump `@haus-tech/product-import-export-plugin` `3.3.11-next.1` → `3.3.11` in
  `bov-ecom/package.json`, lockfile update, PR.
- Deploy staging → verify → deploy prod (per bov-ecom's own release process).
- Post-deploy verification (curl, unauthenticated):
  - `GET https://pim.bad-varme.se/product-import-export/config` → 403
  - same on staging → 403
  - response body contains no `secretAccessKey`.
- Reminder to Tim (outside this plan): rotate AWS keys for `bov-assets` and
  `bov-assets-staging` **after** the fixed version is deployed, since the old
  keys remain harvestable until then and remain compromised regardless.

## Risks / open points

1. **Dashboard on bearer-token setups:** the new Vendure dashboard fetches send
   cookies (`credentials: 'include'`) but no `Authorization` header. If a
   consumer runs `tokenMethod: 'bearer'` only, the dashboard import/export pages
   will start getting 403 after this change. Mitigation: verify how
   `@vendure/dashboard` authenticates its own API calls during the main-branch
   dev-server smoke test; if bearer is unsupported in these fetches, add the
   header from dashboard auth storage in the same PR. bov-ecom (3.3.x, Angular
   admin-ui) is unaffected by this risk.
1b. **Angular admin-ui in cookie mode cross-origin:** no Angular-UI fetch sets
   `credentials: 'include'`, and `getRequestHeaders()` only adds Authorization
   when `tokenMethod === 'bearer'`. An admin-ui served from a different origin
   with cookie sessions would get 403 on all endpoints after this fix. Standard
   same-origin AdminUiPlugin setups (incl. bov-ecom) are unaffected. Mention in
   release notes; optionally add `credentials: 'include'` to the Angular fetches.
2. **Roles narrower than catalog perms:** any operator role lacking
   `ReadCatalog`/`ReadProduct` loses access to these endpoints — intended
   behavior, but worth one line in the release notes.
3. **`e2e/__data__` sqlite caches:** new test server configs may require a new
   cached DB init; the SqljsInitializer regenerates per spec-file name — new
   spec file gets its own cache, no conflict.
4. **Local export storage bypass:** `LocalExportStorageStrategy` writes to
   `static/exports`; a consumer that serves `./static` publicly exposes export
   files (full catalog CSV) regardless of controller auth. bov-ecom uses S3.
   One line in release notes.
5. **Other Vendure projects consuming these packages** (outside bad-varme) will
   need the same version bump; release notes must state the security nature so
   consumers upgrade promptly. Coordinated disclosure: keep the PR titles
   factual but avoid publishing the exposed-domain details.
