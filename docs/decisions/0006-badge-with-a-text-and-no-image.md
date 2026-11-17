# ADR-0006: A badge needs a text or an image, the image is optional

- **Status:** Proposed
- **Date:** 2026-11-17
- **Decided by:** Tim Cifuentes Vargas (draft by Claude)
- **Affects:** packages/badge-plugin (`Badge.asset`, `Badge.assetId`, `CreateBadgeInput.assetId`, `UpdateBadgeInput`, `BadgeService.create` and `update`, Dashboard badge pages, Angular badge list)
- **Related:** branch feat/badge-text-without-image, ADR-0004

## Context

Every badge had to have an uploaded image, and the Shop API typed `Badge.asset` as non-null. A storefront that draws badges as styled text labels, in each shop's own colours (Merchamore's campaign badges), had to upload a dummy image per badge and ignore it. `Badge.text` already existed but was optional decoration.

## Decision

A badge needs a text or an image, or both. `Badge.asset` and `Badge.assetId` become nullable in the Admin and Shop APIs and `CreateBadgeInput.assetId` optional. Create and update refuse a badge left with neither ("A badge needs a text or an image"). On update an omitted field keeps its value and `null` removes it; `assetId: ""` keeps the image as before. A blank text counts as no text and is stored as null. The database schema is unchanged (the column was nullable already).

## Motivation (why)

The plugin decides which products carry a badge; how the badge looks is the storefront's choice. Text-only badges keep that split without dummy assets, and the rule "text or image" still refuses an empty badge.

## Alternatives considered

- Keep the image required and let storefronts ignore it: a dummy upload per badge, and an asset library full of placeholders.
- A separate `TextBadge` type: two lists, two pickers and two Shop API fields for what is one concept.
- A badge `kind` enum (image or text): adds a field the presence of text and image already expresses.

## Consequences

- `Badge.asset` is nullable in the Shop API: typed storefront clients must handle `null` (README "Upgrading"). Existing image badges answer as before.
- `updateBadge` with `text: null` now removes the text, and an unknown `assetId` on update is refused.
- Removing or replacing an image leaves the old asset in the asset library.
- The Dashboard list loads only the fields of visible columns, so it gets a Text column; a user with a saved column layout uses "Reset" once to see it.
