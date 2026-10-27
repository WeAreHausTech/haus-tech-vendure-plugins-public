# ADR-0004: A badge can link a promotion, checked per product by registered condition checks

- **Status:** Proposed
- **Date:** 2026-10-27
- **Decided by:** Tim Cifuentes Vargas (draft by Claude)
- **Affects:** packages/badge-plugin (`Badge.promotion`, `BadgePluginOptions.promotionProductChecks`, `BadgeService.findPromotionBadgesForProduct`, Admin and Shop API `Badge` types, Dashboard badge pages)
- **Related:** branch feat/badge-promotion-link, spec docs/superpowers/specs/2026-10-27-badge-promotion-link-design.md

## Context

A badge hung on a collection and showed until someone removed it. Shops running campaigns had to pick the products twice (collection and promotion) and remove the badge by hand when the promotion ended. Vendure has no query for "the promotions that apply to this product": promotion conditions are checked against an order, not a product.

## Decision

A badge links a collection or a promotion, never both (a nullable `promotionId` next to `collectionId`; nothing is added to Vendure's `Promotion`). A promotion badge shows on a product while the promotion is active (enabled, not deleted, in the channel, inside its dates, no coupon code, global usage limit not reached) and every one of its conditions has a registered product check that says the product is selected. Checks are registered per condition code through `BadgePlugin.init({ promotionProductChecks })`; the plugin ships one for `contains_products`. A condition without a check hides the badge, and the Admin API lists such codes in `Badge.unmatchedConditionCodes` so the Dashboard can warn. Badges are resolved per request, with the active badge promotions loaded once per request.

## Motivation (why)

The promotion stays the one place that holds the products and the dates, so nothing is stored twice and the badge ends with the campaign. Per-code checks let any project make its own conditions badge-aware without the plugin knowing them, and "no check means no badge" never promises a discount the cart will not give.

## Alternatives considered

- Collection holds the products, promotion reads the collection: still two places for dates, and a collection page for every campaign.
- Badge as a promotion action: the badge would only be known once an order exists, so product cards could not show it.
- Precompute badges onto products with a worker job: fast lists, but a second copy of the truth that must follow every promotion and catalogue change; kept as a later option.
- Allow both links (collection names the products, promotion supplies the dates): covers order-level promotions, but picks the products twice and leaked promotion badges through the collection lookups outside the promotion's dates.

## Consequences

- Projects add a migration for the new column.
- Order-level promotions (minimum amount, customer group) get no badge.
- The badge follows conditions, not actions: a promotion that limits its discount only through its action badges every product unless it also has a product condition.
- Search lists cost one condition evaluation per result and promotion badge; precomputation stays the escape hatch.
- The React Dashboard gets the promotion picker; the Angular Admin UI keeps managing collection badges and leaves the promotion link unchanged.
