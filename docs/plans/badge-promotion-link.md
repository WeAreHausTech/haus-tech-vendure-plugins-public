# Badge linked to a promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A badge in `@haus-tech/badge-plugin` can link a promotion instead of a collection, and shows on a product only while that promotion is active and its conditions select the product.

**Architecture:** `Badge` gets a nullable `promotion` relation next to `collection`; a badge holds one link or the other. Shop resolvers append promotion badges to the unchanged collection badges: active badge promotions are loaded once per request through `RequestContextCacheService`, each condition is answered by a product check registered per condition code, and a pure function decides keep or drop. The React Dashboard badge page gets a promotion picker and a warning for conditions without a check.

**Tech Stack:** Vendure 3.6 (`@vendure/core` 3.6.3), TypeORM, NestJS GraphQL, Vitest + SWC, `@vendure/testing` (sqljs), React Dashboard (`@vendure/dashboard`).

**Spec:** `docs/superpowers/specs/2026-10-27-badge-promotion-link-design.md`

## Global Constraints

1. Package `packages/badge-plugin`; plugin `compatibility: '^3.6.0'` and `peerDependencies` stay as they are.
2. A badge links a collection or a promotion, never both: create or update that would leave both set fails with `UserInputError`.
3. Active means: `enabled`, `deletedAt` null, assigned to the active channel, `startsAt` null or <= now, `endsAt` null or > now, `couponCode` null or empty.
4. All conditions must have a check and match; zero conditions means the badge shows on every product.
5. Quantity arguments are ignored by checks.
6. The Shop API `badges` fields keep their shape (`[Badge!]!`).
7. Public repo: no customer names, internal hostnames or credentials in code, docs or commits.
8. Conventional Commits with scope `badge-plugin`; never hand-bump versions.
9. Checks before push, from the repo root: `yarn lint`, `yarn build`, `yarn test`, `npx vitest run --config vitest.config.ts`.

## Choices I made

1. `src/gql/generated.ts` has no committed codegen config (docs/conventions.md, CONFIRM-WITH-TEAM). The new fields are added to the `Badge`, `CreateBadgeInput` and `UpdateBadgeInput` types there by hand, in the generated style, and nothing else in that file changes.
2. Stored condition args are parsed with the configured definition's protected `argsArrayToHash`, reached through a narrow cast, so values parse exactly as Vendure parses them for `check()`.
3. `PromotionService.getActivePromotionsInChannel` filters channel, enabled and deleted only; dates and coupon are filtered in the pure function.
4. The Angular UI is untouched, per the spec.

## Review Focus

1. A promotion badge must never come back from `getBadgeFromCollection`, `getBadgesFromCollections` or `ProductVariant.badges` via collections: holds because `collectionId` is null; Task 4's e2e asserts `getBadgesFromCollections` stays empty for the product's collections.
2. Updating a collection badge from the Angular UI (which sends `collectionId`, never `promotionId`) must keep working: Task 3's e2e updates a collection badge without `promotionId` and expects success.
3. Setting `promotionId` on an existing collection badge without clearing `collectionId` must fail, and sending `collectionId: null` with `promotionId` in the same update must succeed: Task 3 e2e.
4. A promotion whose condition code is no longer in `promotionOptions.promotionConditions` counts as unmatched, not as a crash: Task 2 unit test on `evaluateConditions`.
5. A product check that throws must not break the product query: Task 2 unit test (logs, result `false`).

---

### Task 1: Keep-or-drop rule

**Files:**
- Create: `packages/badge-plugin/src/service/promotion-badge-rule.ts`
- Test: `packages/badge-plugin/src/service/promotion-badge-rule.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ConditionResult = 'match' | 'no-match' | 'unchecked'
  export interface PromotionFacts {
    enabled: boolean
    deletedAt: Date | null
    couponCode: string | null
    startsAt: Date | null
    endsAt: Date | null
  }
  export function isPromotionActive(promotion: PromotionFacts, now: Date): boolean
  export function shouldShowPromotionBadge(promotion: PromotionFacts, conditionResults: ConditionResult[], now: Date): boolean
  ```
  Channel membership is not part of the facts; the query already filters it.

- [ ] **Step 1: Write the failing tests** in `promotion-badge-rule.spec.ts`, with `now = new Date('2026-06-01T12:00:00Z')` and a base `active` fact set (`enabled: true`, all others null):
  1. `isPromotionActive(active, now)` is `true`.
  2. `false` for each of: `enabled: false`; `deletedAt: now`; `couponCode: 'SAVE'`; `startsAt: 2026-06-02`; `endsAt: 2026-06-01T11:59:59Z`; `endsAt` equal to `now`.
  3. `true` for `couponCode: ''`, for `startsAt` equal to `now`, and for `startsAt` in the past with `endsAt` in the future.
  4. `shouldShowPromotionBadge(active, [], now)` is `true` (zero conditions).
  5. `['match', 'match']` gives `true`; `['match', 'no-match']` gives `false`; `['match', 'unchecked']` gives `false`.
  6. An inactive promotion with `['match']` gives `false`.
- [ ] **Step 2: Run** `npx nx test badge-plugin` from the repo root. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** both functions in `promotion-badge-rule.ts`.
- [ ] **Step 4: Run** `npx nx test badge-plugin`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(badge-plugin): rule for showing a promotion badge`.

### Task 2: Product checks and condition evaluation

**Files:**
- Create: `packages/badge-plugin/src/promotion-checks/promotion-product-check.ts` (types)
- Create: `packages/badge-plugin/src/promotion-checks/contains-products-check.ts`
- Create: `packages/badge-plugin/src/promotion-checks/evaluate-conditions.ts`
- Test: `packages/badge-plugin/src/promotion-checks/contains-products-check.spec.ts`, `packages/badge-plugin/src/promotion-checks/evaluate-conditions.spec.ts`
- Modify: `packages/badge-plugin/src/badge.plugin.ts` (option), `packages/badge-plugin/src/index.ts` (exports)

**Interfaces:**
- Consumes: `ConditionResult` from Task 1.
- Produces:
  ```ts
  // promotion-product-check.ts
  export interface PromotionProductCheckInput {
    ctx: RequestContext
    injector: Injector
    productId: ID
    /** The condition's arguments, parsed as Vendure parses them for check(). */
    args: Record<string, unknown>
  }
  export interface PromotionProductCheck {
    code: string
    matches(input: PromotionProductCheckInput): boolean | Promise<boolean>
  }
  // contains-products-check.ts
  export const containsProductsCheck: PromotionProductCheck // code 'contains_products'
  // evaluate-conditions.ts
  export function buildCheckRegistry(custom: PromotionProductCheck[] | undefined): Map<string, PromotionProductCheck>
  export async function evaluateConditions(input: {
    ctx: RequestContext
    injector: Injector
    productId: ID
    conditions: ConfigurableOperation[]          // Promotion.conditions as stored
    definitions: PromotionCondition[]            // config.promotionOptions.promotionConditions
    registry: Map<string, PromotionProductCheck>
  }): Promise<ConditionResult[]>
  export function uncheckedConditionCodes(conditions: ConfigurableOperation[], definitions: PromotionCondition[], registry: Map<string, PromotionProductCheck>): string[]
  ```
  `BadgePluginOptions` gains `promotionProductChecks?: PromotionProductCheck[]`. `BadgePlugin.init` keeps the default `availablePositions` when only checks are passed (merge with the defaults instead of replacing the object). `index.ts` exports the two types, `containsProductsCheck`.

- [ ] **Step 1: Write the failing tests.**
  `contains-products-check.spec.ts`, with a fake injector whose `get(TransactionalConnection)` returns a repository stub listing variant ids `['11', '12']` for product `'1'` (non-deleted variants only):
  1. `args: { productVariantIds: ['12'], minimum: 5 }` gives `true` (quantity ignored).
  2. `args: { productVariantIds: ['99'] }` gives `false`.
  3. `args: { productVariantIds: [] }` gives `false`.
  `evaluate-conditions.spec.ts`, with stub definitions whose `argsArrayToHash` returns `{ parsed: true }`:
  1. `buildCheckRegistry([{ code: 'contains_products', ... }])` replaces the shipped check for that code; `buildCheckRegistry(undefined)` holds `contains_products`.
  2. A condition with a registered check that returns `true` gives `['match']`, and the check received the parsed args.
  3. A condition with no registered check gives `['unchecked']`.
  4. A condition whose code is not in `definitions` gives `['unchecked']`.
  5. A check that throws gives `['no-match']` and calls `Logger.error` once with the code in the message.
  6. `uncheckedConditionCodes` returns the codes of 3 and 4, in condition order.
- [ ] **Step 2: Run** `npx nx test badge-plugin`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement.** `containsProductsCheck` reads the product's non-deleted variant ids through `TransactionalConnection.getRepository(ctx, ProductVariant)` and compares with `idsAreEqual`. `evaluateConditions` runs the checks in order and stops at the first non-match. Use `loggerCtx` from `constants.ts`.
- [ ] **Step 4: Run** `npx nx test badge-plugin`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(badge-plugin): product checks for promotion conditions`.

### Task 3: Entity, admin API and validation

**Files:**
- Modify: `packages/badge-plugin/src/entity/badge.entity.ts`
- Modify: `packages/badge-plugin/src/api/api-extensions.ts`
- Modify: `packages/badge-plugin/src/api/admin.resolver.ts` (add `@Resolver('Badge')` field resolvers, register in `badge.plugin.ts`)
- Modify: `packages/badge-plugin/src/service/badge.service.ts`
- Modify: `packages/badge-plugin/src/gql/generated.ts` (three types only, see Choices 1)
- Test: `packages/badge-plugin/e2e/badge-plugin.e2e-spec.ts`

**Interfaces:**
- Consumes: `uncheckedConditionCodes`, `buildCheckRegistry` from Task 2.
- Produces:
  1. Entity: `@ManyToOne(() => Promotion, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'promotionId' }) promotion: Promotion | null` and `@EntityId({ nullable: true }) promotionId: ID | null`.
  2. Admin schema: `Badge.promotion: Promotion`, `Badge.promotionId: ID`, `Badge.unmatchedConditionCodes: [String!]!`; `promotionId: ID` on `CreateBadgeInput` and `UpdateBadgeInput`. Shop schema: `Badge.promotionId: ID` only.
  3. `BadgeService.unmatchedConditionCodes(ctx: RequestContext, badge: Badge): Promise<string[]>`, empty when `promotionId` is null.
  4. `findOne` and `findAll` load the `promotion` relation.

- [ ] **Step 1: Write the failing e2e tests.** In `beforeAll`, create a product with one variant (`createProduct`, `createProductVariants`), and add the e2e plugin config `promotionOptions` untouched (stock conditions). Bump `SQLITE_SCHEMA_VERSION` to `'3.6.0-badge-promotion-link'`. Tests:
  1. `createBadge` with `promotionId` of a `contains_products` promotion returns `promotionId`, `collectionId: null`, `unmatchedConditionCodes: []`.
  2. `createBadge` with both `collectionId` and `promotionId` rejects with `/collection or a promotion/i`.
  3. `createBadge` with `promotionId: '999999'` rejects with `/No promotion with the id/i`.
  4. `updateBadge` on a collection badge with only `promotionId` rejects with `/collection or a promotion/i`; with `collectionId: null, promotionId` it succeeds and returns `collectionId: null`.
  5. `updateBadge` on a collection badge with only `position` succeeds and leaves `promotionId` null (Angular UI path).
  6. A badge on a `minimum_order_amount` promotion reports `unmatchedConditionCodes: ['minimum_order_amount']`.
  7. `updateBadge` with `promotionId: null` clears the link.
- [ ] **Step 2: Run** `npx vitest run --config vitest.config.ts packages/badge-plugin`. Expected: the new tests FAIL (unknown field `promotionId`).
- [ ] **Step 3: Implement.** In `create` and `update`, resolve the promotion with `PromotionService.findOne(ctx, id)` (channel-scoped) and assign the relation object as the collection code does; compute the final pair (input value when the key is present, else the stored value) and throw `UserInputError('A badge links a collection or a promotion, not both')` when both are set; throw `UserInputError(\`No promotion with the id "${id}" could be found\`)` when missing. `update` must distinguish an omitted `promotionId` (keep) from `null` (clear), and must keep today's `collectionId` handling for callers that omit `promotionId`. Field resolver `unmatchedConditionCodes` uses `ConfigService.promotionOptions.promotionConditions` and the plugin options' registry.
- [ ] **Step 4: Run** the e2e command. Expected: all badge e2e tests PASS, including the existing ones.
- [ ] **Step 5: Run** `npx nx test badge-plugin && npx nx lint badge-plugin && npx nx build badge-plugin`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(badge-plugin): link a badge to a promotion`.

### Task 4: Promotion badges in the Shop API

**Files:**
- Modify: `packages/badge-plugin/src/service/badge.service.ts`
- Modify: `packages/badge-plugin/src/api/shop.resolver.ts`
- Test: `packages/badge-plugin/e2e/badge-plugin.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 1 `shouldShowPromotionBadge`, Task 2 `evaluateConditions`, `buildCheckRegistry`, Task 3 entity.
- Produces: `BadgeService.findPromotionBadgesForProduct(ctx: RequestContext, productId: ID): Promise<Badge[]>`; `findBadgesForProduct`, `findBadgesForSearchResult` and the `ProductVariant.badges` resolver return `[...collectionBadges, ...promotionBadges]` sorted by `order` then id.

- [ ] **Step 1: Write the failing e2e tests** (shop client, `Product.badges`, `SearchResult.badges` from `search`, `ProductVariant.badges` from `product.variants`). Use one product A in a `contains_products` promotion and one product B outside it, and change promotions through `updatePromotion`:
  1. Badge shows on A in all three fields, not on B.
  2. Gone when the promotion is disabled; when `startsAt` is tomorrow; when `endsAt` is yesterday; when it has a `couponCode`.
  3. Gone in a second channel where the badge exists but the promotion is not assigned (create channel, assign badge through `BadgeService.assignToChannel` from `server.app`).
  4. A `minimum_order_amount` promotion badge shows on no product.
  5. A custom check registered via `BadgePlugin.init({ promotionProductChecks: [{ code: 'test_always', matches: () => true }] })` on a custom condition `test_always` added to `promotionOptions.promotionConditions` in the e2e config shows the badge on B too.
  6. `getBadgesFromCollections` for A's collections does not return the promotion badge; collection badges on A still show.
- [ ] **Step 2: Run** the e2e command. Expected: new tests FAIL.
- [ ] **Step 3: Implement.** `findPromotionBadgesForProduct` loads, through `RequestContextCacheService.get(ctx, 'badge-plugin:promotion-badges', ...)`, the channel's badges with non-null `promotionId` joined to `getActivePromotionsInChannel` ids, and filters per product with `shouldShowPromotionBadge(promotion, await evaluateConditions(...), new Date())`.
- [ ] **Step 4: Run** the e2e command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(badge-plugin): show promotion badges in the shop api`.

### Task 5: Dashboard picker and docs

**Files:**
- Modify: `packages/badge-plugin/src/dashboard/gql.ts`, `packages/badge-plugin/src/dashboard/badge-detail.tsx`, `packages/badge-plugin/src/dashboard/badge-list.tsx`
- Modify: `packages/badge-plugin/README.md`, `docs/codebase.md` and `CLAUDE.md` plugin line (writing-documentation skill)

**Interfaces:**
- Consumes: Task 3 admin schema.

- [ ] **Step 1: Add** `getPromotionsDocument` (`promotions(options) { items { id name } totalItems }`) and select `promotionId`, `promotion { id name }`, `unmatchedConditionCodes` in the detail query, `promotion { id name }` in the list query.
- [ ] **Step 2: Add** a "Promotion" relation selector to the badge form next to "Collection", same component and pattern as the collection selector. Picking one clears the other. Below it, when `unmatchedConditionCodes` is non-empty, show: `This promotion's conditions can't be checked per product: <codes>. This badge will not show.` The list shows the promotion name where the collection name is empty.
- [ ] **Step 3: Run** `npx tsc -p packages/badge-plugin/tsconfig.dashboard.json --noEmit` and `npx nx lint badge-plugin`. Expected: no errors.
- [ ] **Step 4: Local Dashboard run.** Start a throwaway Vendure dev server in the scratchpad that loads the built plugin and `DashboardPlugin` with sqljs; create a promotion badge, see the warning for a `minimum_order_amount` promotion, and see the badge on `Product.badges` in the shop API. Record what ran and what it showed for the PR body.
- [ ] **Step 5: Docs.** README: the promotion link, the `promotionProductChecks` option with a short example check, and the migration note (new `promotionId` column, generate a migration). Run the writing-documentation skill for `docs/` and `CLAUDE.md`.
- [ ] **Step 6: Run** the full checks from Global Constraints 9. Expected: all PASS.
- [ ] **Step 7: Commit** `feat(badge-plugin): promotion picker in the dashboard` and `docs(badge-plugin): promotion badges`.
