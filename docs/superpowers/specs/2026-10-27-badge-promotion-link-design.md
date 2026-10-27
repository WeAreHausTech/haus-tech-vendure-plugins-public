# Badge linked to a promotion: design

Package: `@haus-tech/badge-plugin`. Date: 2026-10-27. Status: draft for review.

## 1. Intent

Today a badge hangs on a collection and shows on every product in it, forever, until someone removes it. Shops that run campaigns want the badge to follow the campaign: shown on exactly the products the promotion discounts, and only while the promotion runs. Doing that with collections means choosing the products twice (collection and promotion) and setting the dates twice.

This change lets a badge point at a promotion. The promotion stays the one place that says which products and which dates; the badge only says what it looks like.

Success:

1. A badge linked to a promotion shows on a product only while that promotion is enabled, inside its start and end dates, in the active channel, and without a coupon code.
2. It shows only on products the promotion's conditions select, judged per product without a cart.
3. Projects can make their own promotion conditions badge-aware with a small registered check.
4. Collection badges behave exactly as before. The Shop API's `badges` fields keep their shape, so existing storefronts need no change.

## 2. Decisions

1. **The badge points at the promotion** (`Badge.promotionId`), next to the existing `collectionId`. Nothing is added to Vendure's `Promotion` entity, so the change stays inside the plugin's own table, API and pages.
2. **A badge links a collection or a promotion, never both.** A collection badge shows on the products in the collection, as today. A promotion badge shows on a product while the promotion is active and its conditions match the product. A promotion that should read its products from a collection does so through its own condition (for example a project condition "product is in collection X" with a product check), so the products are chosen once, on the promotion. Saving a badge with both links set fails with `UserInputError`. A badge with neither link shows nowhere, as today. Because promotion badges have no collection, the existing collection lookups (`getBadgeFromCollection`, `getBadgesFromCollections`, `ProductVariant.badges` through the variant's collections) never return them, and no date check is needed there.
3. **Product checks per condition code.** A product check answers "would this condition select this product?" for one condition type. The plugin ships one check, for Vendure's `contains_products`. Projects register checks for their own conditions through a new init option; a registered check with the same code replaces the shipped one.
4. **All conditions must match.** Vendure requires every condition of a promotion to pass, so the badge does too. If any condition has no registered check, the badge is not shown, because the plugin cannot know. A promotion with no conditions applies to every order in Vendure, so its badge shows on every product.
5. **Quantity arguments are ignored.** `contains_products` carries a minimum quantity. A product check only asks whether the product is one of the selected ones; the badge invites the shopper to reach the quantity.
6. **Coupon promotions show no badge.** A shopper cannot get the discount without the code, so a badge would promise something the cart does not give.
7. **Active means**: `enabled`, not deleted, assigned to the active channel, `startsAt` empty or in the past, `endsAt` empty or in the future. The same test Vendure applies before a promotion takes part in an order.
8. **React Dashboard only.** The promotion picker is added to the Dashboard badge page. The Angular Admin UI keeps managing collection badges; saving a badge there leaves its promotion link unchanged, because an omitted `promotionId` in `updateBadge` means "no change".
9. **No precomputation.** Badges are resolved per request. Active promotions with a badge are loaded once per request; product checks run per product. Writing badges onto products ahead of time stays a later option if lists get slow.

## 3. Scope

In:

1. `promotionId` on the `Badge` entity (nullable, set to null when the promotion is hard-deleted).
2. Admin API: `Badge.promotion`, `Badge.promotionId`, `promotionId` on `CreateBadgeInput` and `UpdateBadgeInput`, and `Badge.unmatchedConditionCodes: [String!]!`.
3. Shop API: `Product.badges`, `ProductVariant.badges` and `SearchResult.badges` return collection badges plus active promotion badges, ordered by the badge's `order` then id.
4. Init option `promotionProductChecks`, the exported type for a check, and the shipped `contains_products` check.
5. Dashboard badge page: promotion picker, and a warning listing `unmatchedConditionCodes`.
6. Unit tests, e2e tests, README and changelog through the release flow.

Out:

1. A badge picker on Vendure's promotion page.
2. Angular Admin UI support for the promotion link.
3. Assigning badges to other channels (unchanged: a badge shows only in channels it is assigned to).
4. Precomputing or caching badges across requests.
5. Struck-through or campaign prices.
6. A shipped check for `at_least_n_with_facets`.

## 4. Data model

```ts
// Badge entity, added next to collection/collectionId
@ManyToOne(() => Promotion, { nullable: true, onDelete: 'SET NULL', eager: false })
promotion: Promotion | null

@EntityId({ nullable: true })
promotionId: ID | null
```

Several badges may point at the same promotion (one per position, for example). Projects generate a migration for the new column, as they did for the table (README section "Configuration").

## 5. Product checks

```ts
export interface PromotionProductCheckInput {
  ctx: RequestContext
  injector: Injector
  productId: ID
  /** The condition's arguments, parsed with its definition as Vendure parses them for `check()`. */
  args: Record<string, unknown>
}

export interface PromotionProductCheck {
  /** The promotion condition code this check answers for, e.g. 'contains_products'. */
  code: string
  matches(input: PromotionProductCheckInput): boolean | Promise<boolean>
}

BadgePlugin.init({
  availablePositions: [...],
  promotionProductChecks: [myConditionCheck],
})
```

Shipped check: `contains_products`, true when one of the product's variants is in `productVariantIds`. A check for `at_least_n_with_facets` is left out until a project needs it; a project can register one.

The plugin looks condition definitions up in `promotionOptions.promotionConditions` by code to parse stored arguments. A stored condition whose code is no longer configured counts as unmatched.

## 6. Resolution

For one product in one request:

1. Collection badges: unchanged (`findBadgesForProduct`).
2. Promotion badges: the request's active promotions that have at least one badge in the channel (loaded once per request through Vendure's request cache).
3. Keep a promotion badge when the promotion has no conditions, or every condition has a check and every check returns true.
4. Append the kept promotion badges to the collection badges and order by `order` then id. The two sets never overlap, since a badge has only one link.

`SearchResult.badges` uses the result's `productId`; `ProductVariant.badges` uses the variant's `productId`.

The decision in step 3 plus the active test is a pure function (promotion facts plus check results in, keep or drop out) so it is unit-tested without a database.

## 7. Admin API and validation

1. `promotionId` must name a promotion in the active channel, and a badge may not have both `collectionId` and `promotionId` after the mutation; otherwise it fails with `UserInputError`.
2. `null` clears the link; omitting the field leaves it unchanged.
3. `unmatchedConditionCodes` lists the linked promotion's condition codes that have no check. Empty when there is no promotion or when every condition is covered. The Dashboard shows it as a warning: "This promotion's conditions can't be checked per product: minimum_order_amount. This badge will not show."
4. Permissions unchanged (catalog permissions).

## 8. Error handling

1. A check that throws is logged with the condition code and treated as no match; the product still renders with its other badges.
2. A promotion deleted after linking stops showing its badges (soft delete) or clears the link (hard delete).

## 9. Testing

1. Unit (`*.spec.ts`): the keep-or-drop function for zero, matching, failing and unchecked conditions and every active-test clause in decision 7; the shipped check, including its quantity argument being ignored.
2. E2E (`e2e/badge-plugin.e2e-spec.ts`, extended): a badge linked to a promotion appears on a matching product and not on another; disappears when the promotion is disabled, before its start, after its end, given a coupon code, or not in the channel; a `minimum_order_amount` promotion shows no badge and reports it in `unmatchedConditionCodes`; saving both links fails; a custom check registered through init; `unmatchedConditionCodes`; collection badges unchanged; `SearchResult.badges` and `ProductVariant.badges` agree with `Product.badges`.
3. Local Dashboard run: create a promotion badge, see the warning for an order-level condition, see the badge in a shop query.

## 10. Release

A `feat(badge-plugin)` commit, so `nx release` gives a minor version. The changelog notes the new column and the migration step.
