# Product import/export: merge the 3.3 line into main, then fix self-relation exports

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `main` carry everything the published `@haus-tech/product-import-export-plugin@3.6.3` ships (the 3.3 line's export engine) together with main's own 3.6 work, then fix the export crash on self-referencing relation custom fields.

**Architecture:** Part A is a 3-way git merge of tag `product-import-export-plugin@3.3.12` onto main, restricted to `packages/product-import-export-plugin`, resolved by one rule per area: dashboard and importer from main, export engine from the 3.3 line, package metadata from main, all tests from both. Part B adds a small loader that reads self-referencing relation custom fields with an explicit join alias instead of through `ProductService.findAll`, which Postgres rejects for those fields.

**Tech Stack:** Vendure 3.6.3 (`@vendure/core`, `@vendure/testing` with sqljs), TypeORM, Nx 22, Yarn 4, Vitest, React dashboard extension.

**Spec:** The decision log is the Merchamore conversation of 2026-10-08 (Tim chose "A2: true merge of both lines"). The merge rules it fixed are restated under Global Constraints; there is no separate spec file.

## Background (facts the implementer cannot see from the tree)

1. npm `3.6.3` (published 2026-08-21 from main commit `6da5798`) contains the code of tag `product-import-export-plugin@3.3.11`: dashboard files byte-identical to that tag, `compatibility: '^2.0.0 || ^3.0.0'`, changelog with 3.3.11-next entries. `3.6.0` to `3.6.2` contained main's code.
2. Main-only since the merge base `ef889d3`: export configuration panel, active-channel refetch (`use-active-channel-key.ts`), drag-and-drop import with 20 MB limit, shared option groups by `name:code` (importer, parser, exporter, README section "Sharing option groups"), installation id, Vendure 3.6 compatibility and hub JSDoc, REST security fix (#24).
3. 3.3-line-only: export engine rework (chunked variant loading, single-query stock, `sort: { id: ASC }` paging, progress callback, asset position order, sequential pages), `id` export field, `customExportColumns`, name-required validation (422), tax-category fallback for new variants (`276bed5`), security fix backport (#23, same change as #24), and three e2e additions.
4. A merge dry run conflicts in 11 files: root `package.json`, root `yarn.lock`, and in the package: `CHANGELOG.md`, `README.md`, `package.json`, `e2e/product-import-export-plugin.e2e-spec.ts`, `e2e/rest-api-security.e2e-spec.ts`, `src/api/plugin.controller.ts`, `src/dashboard/export-dialog.tsx`, `src/dashboard/exported-list.tsx`, `src/providers/import-providers/product-importer.ts`.
5. Baseline: on main, `yarn vitest run --config vitest.config.ts packages/product-import-export-plugin` passes (2 files, 34 tests).
6. The self-relation bug: with a `ProductVariant` relation custom field whose `entity` is `ProductVariant` (Merchamore's `baseVariant`), `ProductService.findAll(ctx, …, ['variants.customFields.baseVariant'])` fails on Postgres with `table name "ProductVariant" specified more than once` (TypeORM's RelationIdLoader joins the table under its own alias twice). sqljs accepts the duplicate alias, so the plugin's e2e database cannot reproduce the crash; a plain `createQueryBuilder('variant').leftJoin('variant.customFields.baseVariant', 'related')` works on Postgres (verified 2026-10-08).

## Global Constraints

- Work on branch `feat/product-import-export-merge-3-3-line` (worktree already created from `origin/main`). Part A and Part B are separate PRs; Part B branches from Part A's branch.
- Nothing outside `packages/product-import-export-plugin/` changes relative to main.
- Package version stays `3.6.3`; `peerDependencies['@vendure/core']` and the plugin `compatibility` stay `^3.6.0`; `csv-parse` peer stays `^6.0.0`; `README.md` (not `.mdx`) stays the shipped README. `nx release` owns version and `CHANGELOG.md`: do not hand-edit either.
- Option groups export as `<translated name>:<code>` (main's `formatOptionGroupForExport`), never as the plain name.
- The CSV `id` column is never column 0 (the importer treats column 0 as a product id).
- Public repo: no customer names, hostnames or credentials in code, tests, commits or docs. Refer to the self-relation case generically ("a `ProductVariant` custom field relating to `ProductVariant`").
- Conventional Commits (`feat(product-import-export-plugin): …`, `fix(product-import-export-plugin): …`); they drive the changelog.
- Gate for every task that ends in a commit: `yarn nx run product-import-export-plugin:build`, `yarn nx run product-import-export-plugin:lint`, `yarn nx run product-import-export-plugin:typecheck`, and `yarn vitest run --config vitest.config.ts packages/product-import-export-plugin` all green.

## Review Focus

1. A group whose translation is missing for a language must export as an empty cell, not `:code`. Covered by main's `formatOptionGroupForExport` returning `''` when the translated name is missing; Task 3 Step 4 keeps that method, no new test.
2. A `customExportColumns` entry selected in the dashboard must reach the server in `selectedExportFields`, otherwise the column silently disappears. Pinned in Task 6 (manual check) and by the 3.3 e2e `omits custom columns that are not selected`.
3. Import of a CSV without a `taxCategory` column must create variants with the default tax category, and an update must not overwrite an existing variant's tax category. Pinned in Task 4 (new assertion from `276bed5`).
4. A self-referencing relation custom field that is a list (`list: true`) must export as `id|id`, and a null relation as an empty cell. Pinned in Task 9.
5. Progress reporting must never report 100 before the job completes. Covered by the 3.3 engine (`Math.min(99, …)`), re-asserted by reading the merged code in Task 3, no new test.

---

## Part A: merge the 3.3 line into main

### Task 1: Merge mechanics, repo-level files back to main

**Files:**
- Modify: everything git touches during the merge; outside the package, every path is reset to main.

**Interfaces:**
- Produces: an in-progress merge (no commit yet) whose only differences from main are under `packages/product-import-export-plugin/`, with conflict markers left in the 9 package files listed in Background 4.

- [ ] **Step 1: Start the merge without committing**

Run, in the worktree:

```bash
git merge --no-commit --no-ff product-import-export-plugin@3.3.12
```

Expected: exit 1 with "Automatic merge failed; fix conflicts and then commit the result."

- [ ] **Step 2: Reset every path outside the package to main**

Run:

```bash
git diff --name-only --cached main -- . ':!packages/product-import-export-plugin' > /tmp/outside.txt
git diff --name-only --diff-filter=U -- . ':!packages/product-import-export-plugin' >> /tmp/outside.txt
sort -u /tmp/outside.txt | while read -r p; do if git cat-file -e "main:$p" 2>/dev/null; then git checkout main -- "$p"; else git rm -q --cached "$p" && rm -f "$p"; fi; done
```

Then verify:

```bash
git diff --stat main -- . ':!packages/product-import-export-plugin'
git diff --cached --stat main -- . ':!packages/product-import-export-plugin'
```

Expected: both print nothing. `git status --short` shows only paths under the package.

- [ ] **Step 3: List what is left**

Run: `git diff --name-only --diff-filter=U`
Expected: exactly the 9 package files from Background 4 (root `package.json` and `yarn.lock` are gone from the list).

### Task 2: Package metadata and docs conflicts

**Files:**
- Modify: `packages/product-import-export-plugin/package.json`, `CHANGELOG.md`, `README.md`, `project.json`, `vitest.config.ts`
- Delete: `packages/product-import-export-plugin/README.mdx` (if the merge added it)

- [ ] **Step 1: Take main's versions**

Run:

```bash
cd packages/product-import-export-plugin
git checkout main -- package.json CHANGELOG.md README.md project.json vitest.config.ts
git rm -q --cached README.mdx 2>/dev/null; rm -f README.mdx
git add package.json CHANGELOG.md README.md project.json vitest.config.ts
```

- [ ] **Step 2: Port the 3.3 README content into `README.md`**

In `README.md` (main's), make these three additions, text taken from `git show product-import-export-plugin@3.3.12:packages/product-import-export-plugin/README.mdx`:

1. Row `customExportColumns` in the "Export options" table (3.3 line 90), placed after `requiredExportFields`.
2. Section `### Custom export columns` (3.3 lines 101 to 133), placed after `### Storage strategy`.
3. Under `### Exporting products`, the two bullets about `id` and `customExportColumns` (3.3 lines 214 and 216), placed after the existing bullet about `optionGroups`/`optionValues`. Add a third bullet: "The job reports progress per page; the Dashboard job queue shows it."

Keep main's "Sharing option groups" section unchanged.

- [ ] **Step 3: Verify**

Run: `grep -c "customExportColumns" packages/product-import-export-plugin/README.md`
Expected: 4 or more. `git diff --name-only --diff-filter=U` no longer lists these files.

### Task 3: Source conflicts and semantic review of the auto-merge

**Files:**
- Modify: `src/api/plugin.controller.ts`, `src/dashboard/export-dialog.tsx`, `src/dashboard/exported-list.tsx`, `src/providers/import-providers/product-importer.ts` (conflicted)
- Review: `src/services/product-export.service.ts`, `src/types.ts`, `src/product-import-export.plugin.ts`, `src/index.ts`, `src/services/product-export-queue.service.ts`, `src/api/product-export.controller.ts`, `src/dashboard/import.tsx`, `src/dashboard/index.tsx`, `src/dashboard/export.tsx`, `src/dashboard/bulk-export.tsx`, `src/dashboard/utils.ts` (auto-merged)

**Interfaces:**
- Produces: `ProductExportService.createExportFile(ctx, selectionIds, fileName, selectedCustomFields, exportAssetsAs, selectedExportFields, pageSize = 25, onProgress?: (percent: number) => void)` and `private loadVariantsForProducts(ctx, productIds: ID[], variantRelations: string[]): Promise<Map<string, ProductVariant[]>>` exactly as on the 3.3 line; `formatOptionGroupForExport(group, lang)` from main kept and used for `optionGroupNames`.

- [ ] **Step 1: `plugin.controller.ts`: union**

Resolve to main's file plus the two 3.3 lines (`customExportColumns?: Array<{ name: string }>` in `PublicPluginConfig.exportOptions`, and the `customExportColumns: exportOptions?.customExportColumns?.map(({ name }) => ({ name }))` entry in `toPublicPluginConfig`).

- [ ] **Step 2: `export-dialog.tsx`, `exported-list.tsx`: main's**

Run: `git checkout main -- src/dashboard/export-dialog.tsx src/dashboard/exported-list.tsx && git add src/dashboard/export-dialog.tsx src/dashboard/exported-list.tsx` (from the package directory).

- [ ] **Step 3: `product-importer.ts`: main's plus the tax-category fallback**

Resolve to main's file, then apply the two hunks of commit `276bed5` by hand (`git show 276bed5 -- packages/product-import-export-plugin/src/providers/import-providers/product-importer.ts`):

1. In the variant input spread: `...(variant.taxCategory !== undefined || !existingVariant ? { taxCategoryId: this.getMatchingTaxCategoryId(variant.taxCategory, taxCategories.items) } : {})`, with the comment from the commit.
2. `getMatchingTaxCategoryId(name: string | undefined, taxCategories: TaxCategory[]): ID` with the default-or-first fallback and `InternalServerError('No TaxCategory found')` when there is none.

Keep main's `buildSharedOptionGroupMap`, main's `assetService.update` calls and main's `{ products: { id } }` query.

- [ ] **Step 4: Review the auto-merged export engine**

Open `src/services/product-export.service.ts` and check, fixing by hand where needed:

1. `optionGroupNames` maps with `this.formatOptionGroupForExport(group, lang)` and the method still exists (the 3.3 line removed it; git may have dropped it).
2. `src/product-import-export.plugin.ts` keeps main's JSDoc on the class and on `init`, and `compatibility: '^3.6.0'`; the two storage strategy interfaces keep main's JSDoc.
3. No `Bottleneck` import remains; `bottleneck` can stay in `package.json` dependencies (leave it, removing deps is out of scope).
4. `createExportFile` has the 3.3 signature from Interfaces; `ProductExportQueueService` passes `(percent) => job.setProgress(percent)`.
5. `src/types.ts` has `CustomExportColumn`, `'id'` in `ProductFields`, and main's JSDoc on `PluginInitOptions`.

- [ ] **Step 5: Verify the dashboard files equal main's**

Run (from the repo root):

```bash
for f in import.tsx index.tsx export.tsx bulk-export.tsx export-configuration-panel.tsx use-active-channel-key.ts; do git diff --quiet main -- packages/product-import-export-plugin/src/dashboard/$f && echo "$f ok"; done
```

Expected: six `ok` lines. `utils.ts` differs by the two 3.3 lines only (`'id'` and `customExportColumns`).

- [ ] **Step 6: Build and typecheck**

Run: `yarn nx run product-import-export-plugin:build && yarn nx run product-import-export-plugin:typecheck`
Expected: both succeed. Fix compile errors inside the package only.

### Task 4: Merge the e2e suite

**Files:**
- Modify: `e2e/product-import-export-plugin.e2e-spec.ts`, `e2e/rest-api-security.e2e-spec.ts`
- Add (from the 3.3 line): `e2e/custom-export-columns.e2e-spec.ts`, `e2e/export-paging-and-large-products.e2e-spec.ts`

- [ ] **Step 1: `rest-api-security.e2e-spec.ts`: union**

Resolve to main's file plus the 3.3 additions: the `customExportColumns: [{ name: 'storeUrl', resolve: () => 'https://example.com' }]` export option, `'customExportColumns'` in `ALLOWED_EXPORT_KEYS`, and the assertion `expect(config.exportOptions.customExportColumns).toEqual([{ name: 'storeUrl' }])`.

- [ ] **Step 2: `product-import-export-plugin.e2e-spec.ts`: main's plus the 3.3 tests**

Resolve to main's file (keep `SQLITE_SCHEMA_VERSION = '3.6.0'`, keep the shared option group test and the `'Size:option-group-test-product-size'` assertion). Append, from `git show product-import-export-plugin@3.3.12:packages/product-import-export-plugin/e2e/product-import-export-plugin.e2e-spec.ts`:

1. `it('rejects export-all when name is missing from selectedExportFields')` (expects 422 and the message `name is a required export field`).
2. `it('exports product id on every variant row when id is selected')`.
3. `it('omits id column when id is not selected')`.
4. `it('re-imports an export containing id and custom columns without errors')`.

- [ ] **Step 3: Add the tax-category assertion (Review Focus 3)**

In the main spec, add:

```ts
it('assigns the default tax category to a new variant imported without a taxCategory column', async () => {
  // Arrange: import 'name,slug,description,sku,price\nTax fallback,tax-fallback,d,TAX-FB-1,100'
  // Assert: the ProductVariant with sku TAX-FB-1 has taxCategory.id equal to the default tax category's id
})
```

- [ ] **Step 4: Add the two 3.3 spec files unchanged**

Run: `git checkout product-import-export-plugin@3.3.12 -- packages/product-import-export-plugin/e2e/custom-export-columns.e2e-spec.ts packages/product-import-export-plugin/e2e/export-paging-and-large-products.e2e-spec.ts`

Then grep both for `optionGroups` assertions that expect a plain name (none were found on 2026-10-08; if one appears, change it to `name:code`). Their ports (`3060` in export paging) must not collide with `3057` and `3059`.

- [ ] **Step 5: Run the suite**

Run: `yarn vitest run --config vitest.config.ts packages/product-import-export-plugin`
Expected: 4 files pass; test count is 34 + 4 + 1 + the two new files' tests. Fix failures in the package source or the tests, following the Global Constraints (never by removing a main test).

### Task 5: Commit Part A

- [ ] **Step 1: Run the full gate**

Run: `yarn nx run product-import-export-plugin:build && yarn nx run product-import-export-plugin:lint && yarn nx run product-import-export-plugin:typecheck && yarn vitest run --config vitest.config.ts packages/product-import-export-plugin`
Expected: all green. Also `git diff --stat main -- . ':!packages/product-import-export-plugin'` prints nothing.

- [ ] **Step 2: Commit the merge**

```bash
git add -A packages/product-import-export-plugin docs/plans/product-import-export-merge-3-3-line.md
git commit -m "feat(product-import-export-plugin): merge the 3.3 line's export engine into main" -m "npm 3.6.3 was published from the 3.3 line, so main lacked chunked variant loading, single-query stock levels, sorted paging, progress reporting, the id export field, customExportColumns and the tax-category fallback, while the 3.3 line lacked main's dashboard, shared option groups and Vendure 3.6 compatibility. This merge keeps main's dashboard, importer and metadata and takes the 3.3 export engine and tests."
```

Push and open the PR only on explicit OK (house rule).

### Task 6: Dashboard additions from the 3.3 line

**Files:**
- Modify: `src/dashboard/export-configuration-panel.tsx`, `src/dashboard/utils.ts`

**Interfaces:**
- Consumes: `PublicPluginConfig.exportOptions.customExportColumns?: Array<{ name: string }>` from Task 3.
- Produces: the request's `selectedExportFields` query parameter contains the selected custom column names after the standard fields.

- [ ] **Step 1: Types**

In `utils.ts`: add `'id'` as the first member of `ProductFields`; add `customExportColumns?: Array<{ name: string }>` to `PluginInitOptions['exportOptions']`.

- [ ] **Step 2: Panel**

In `export-configuration-panel.tsx`:

1. `AVAILABLE_EXPORT_FIELDS`: insert `'id'` after `'description'` (CSV column order).
2. State `customColumnNames: string[]` and `selectedCustomColumns: string[]`, both set from `configData.exportOptions?.customExportColumns?.map((c) => c.name) ?? []` in `fetchInitial` (all selected by default, as the 3.3 dialog did).
3. `toggleCustomColumn(name: string)`; include custom columns in `derivedToggleAll` and `toggleSelectAll` (select all / none).
4. Render a third checkbox grid below the custom fields grid, ids `${idPrefix}-custom-column-${name}`, only when `customColumnNames.length > 0`.
5. In `submitExport`, send `selectedExportFields=[...selectedExportFields, ...selectedCustomColumns].join(',')`; add `selectedCustomColumns` to the `useCallback` dependency list.

- [ ] **Step 3: Verify by build and a manual check**

Run: `yarn nx run product-import-export-plugin:build && yarn nx run product-import-export-plugin:typecheck`
Expected: green. Manual: in a consuming app with `customExportColumns: [{ name: 'permalink', resolve: () => 'x' }]`, the export dialog shows `id` and `permalink`, and an export with `permalink` selected has that column (Review Focus 2).

- [ ] **Step 4: Commit**

```bash
git add packages/product-import-export-plugin/src/dashboard
git commit -m "feat(product-import-export-plugin): offer the id field and custom export columns in the Dashboard export panel"
```

---

## Part B: self-referencing relation custom fields in exports

Branch `fix/product-import-export-self-relation-export` from the Part A branch.

### Task 7: Failing e2e test on sqljs

**Files:**
- Create: `e2e/self-relation-custom-fields.e2e-spec.ts`

**Interfaces:**
- Consumes: `ProductExportService.createExportFile` (Task 3 Interfaces), `ProductService.findAll`, `ProductExportService['loadVariantsForProducts']`.

- [ ] **Step 1: Write the test**

Own sqljs data dir `__data-self-relation__` (sibling of `__data__`, same `.schema-version` handling as `export-paging-and-large-products.e2e-spec.ts`), `apiPort = 3061`, config:

```ts
customFields: {
  Product: [{ name: 'relatedProduct', type: 'relation', entity: Product, nullable: true, list: false }],
  ProductVariant: [
    { name: 'baseVariant', type: 'relation', entity: ProductVariant, nullable: true },
    { name: 'siblings', type: 'relation', entity: ProductVariant, list: true },
  ],
},
plugins: [ProductImportExportPlugin.init({ importOptions: {}, exportOptions: {} })],
```

Arrange: import two single-variant products (`SELF-A`, `SELF-B`) with `runImport`; set `A.customFields.relatedProduct = B`, `A.variant.customFields.baseVariant = B.variant`, `A.variant.customFields.siblings = [B.variant]` through the repositories. Export with `selectedCustomFields = 'relatedProduct,baseVariant,siblings'` and `selectedExportFields = 'name,sku'`.

Assertions:

```ts
it('never passes a self-referencing relation custom field to ProductService.findAll', …)
  // vi.spyOn(server.app.get(ProductService), 'findAll'); every call's relations argument
  // contains no entry ending in 'customFields.relatedProduct'
it('never passes a self-referencing relation custom field to the variant relation load', …)
  // vi.spyOn(ProductExportService.prototype as any, 'loadVariantsForProducts'); the third
  // argument contains neither 'customFields.baseVariant' nor 'customFields.siblings'
it('exports the related ids: single as id, list as id|id, missing as empty', …)
  // row SELF-A: relatedProduct === String(B.id), baseVariant === String(B.variant.id), siblings === String(B.variant.id)
  // row SELF-B: all three cells === ''
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn vitest run --config vitest.config.ts packages/product-import-export-plugin/e2e/self-relation-custom-fields.e2e-spec.ts`
Expected: the two spy tests FAIL (the relations are passed today); the ids test passes on sqljs (it documents the expected output; Postgres is where today's code crashes).

### Task 8: Pure split helper, unit-tested

**Files:**
- Create: `src/services/self-relation-custom-fields.ts`
- Test: `src/services/self-relation-custom-fields.spec.ts` (runs under the package's `vitest.config.ts`)

**Interfaces:**
- Produces:

```ts
export interface SelfRelationSplit {
  /** relation paths safe for findAll / repository relations, e.g. 'customFields.brand' */
  relations: string[]
  /** names of relation custom fields whose entity is the owner entity itself */
  selfRelationNames: string[]
}
export function splitSelfRelationCustomFields(
  fields: CustomFieldConfig[],
  owner: typeof Product | typeof ProductVariant,
  prefix: string, // 'customFields.' or 'variants.customFields.'
): SelfRelationSplit
```

- [ ] **Step 1: Write the failing unit test**

```ts
it('keeps relations to other entities and separates self relations', () => {
  const split = splitSelfRelationCustomFields(
    [
      { name: 'brand', type: 'relation', entity: Facet },
      { name: 'baseVariant', type: 'relation', entity: ProductVariant },
      { name: 'note', type: 'string' },
    ] as CustomFieldConfig[],
    ProductVariant,
    'customFields.',
  )
  expect(split).toEqual({ relations: ['customFields.brand'], selfRelationNames: ['baseVariant'] })
})
it('applies the prefix to kept relations only', …) // prefix 'variants.customFields.' → 'variants.customFields.brand'
it('returns empty lists when there are no relation fields', …)
```

- [ ] **Step 2: Make unit specs run at all**

`packages/product-import-export-plugin/vitest.config.ts` includes only `e2e/**/*.e2e-spec.ts` (issue #27: the test target silently runs no unit specs). Add `'src/**/*.spec.ts'` to its `include`.

- [ ] **Step 3: Run to verify it fails**

Run: `yarn nx run product-import-export-plugin:test`
Expected: the new spec is collected and fails with "Cannot find module './self-relation-custom-fields'".

- [ ] **Step 4: Implement** the function (a `relation` field is "self" when `field.entity === owner`).

- [ ] **Step 5: Run to verify it passes**

Run: `yarn nx run product-import-export-plugin:test`
Expected: the spec's 3 tests pass alongside the e2e files.

### Task 9: Loader with an explicit join alias, wired into the export

**Files:**
- Modify: `src/services/self-relation-custom-fields.ts` (add the loader), `src/services/product-export.service.ts`

**Interfaces:**
- Produces:

```ts
export async function loadSelfRelationCustomFieldIds(
  repository: Repository<Product> | Repository<ProductVariant>,
  alias: string,            // 'product' | 'variant'
  ids: ID[],
  fieldNames: string[],
): Promise<Map<string, Record<string, ID | ID[] | null>>>  // keyed by String(entity id)
```

One query per field name: `repository.createQueryBuilder(alias).select([`${alias}.id`, 'related.id']).leftJoin(`${alias}.customFields.${name}`, 'related').where(`${alias}.id IN (:...ids)`, { ids }).getMany()`; a list field yields `ID[]` (empty array when none), a single field `ID | null`.

- [ ] **Step 1: Wire into `createExportFile`**

1. Replace the two `…RelationCustomFields` lists with `splitSelfRelationCustomFields(this.configService.customFields.Product, Product, 'customFields.')` and `splitSelfRelationCustomFields(this.configService.customFields.ProductVariant, ProductVariant, 'customFields.')` (variants are loaded by `loadVariantsForProducts`, whose relation list has no `variants.` prefix).
2. After `findAll`, when `productSplit.selfRelationNames.length > 0`: load the map for the page's product ids and set `product.customFields[name]` to `{ id }`, `[{ id }, …]` or `null` so `handleCustomFields` → `serializeRelationCustomFieldIds` keeps working unchanged.
3. After `loadVariantsForProducts`, the same for every variant on the page.

- [ ] **Step 2: Run the Task 7 spec**

Run: `yarn vitest run --config vitest.config.ts packages/product-import-export-plugin/e2e/self-relation-custom-fields.e2e-spec.ts`
Expected: 3 passed.

- [ ] **Step 3: Full gate and commit**

Run the Global Constraints gate. Then:

```bash
git add packages/product-import-export-plugin/src/services/self-relation-custom-fields.ts packages/product-import-export-plugin/src/services/self-relation-custom-fields.spec.ts packages/product-import-export-plugin/src/services/product-export.service.ts packages/product-import-export-plugin/e2e/self-relation-custom-fields.e2e-spec.ts
git commit -m "fix(product-import-export-plugin): export self-referencing relation custom fields without a duplicate table alias" -m "ProductService.findAll with a relation custom field whose entity is the owner entity (a ProductVariant field relating to ProductVariant) fails on Postgres with 'table name specified more than once'. Such fields are now left out of the relation lists and loaded per page with an explicit join alias; the CSV output is unchanged (id, id|id for lists, empty when unset)."
```

### Task 10: README note and release handoff

- [ ] **Step 1: README**

Under "Optional columns" → custom fields row, add one sentence: "Relation custom fields export the related entity's id (`id|id` for list fields), including fields that relate a product or variant to its own entity type."

- [ ] **Step 2: Handoff (not automated)**

1. Open the Part B PR against the Part A branch (or against main after Part A merges), squash per house rule.
2. Release with `nx release` from main (Tim; needs npm publish rights): expected `3.6.4`.
3. In the consuming Merchamore repo: bump to `3.6.4`, add an e2e that runs the `product-export` job to completion against Postgres with the `baseVariant` custom field configured, and verify "Export all products" in the hosted dashboard.
