---
name: badge-plugin
title: Badge Plugin
description: Vendure plugin for managing and displaying product badges via the admin UI and shop API.
version: 4.0.7
tags:
  - vendure
  - plugin
  - badge
  - product
  - label
---

# Badge Plugin

A Vendure plugin for creating image badges and showing them on products in your storefront. A badge is an image asset (e.g. "New", "Sale", "Best Seller") placed at a fixed position on a product image. Badges are attached to **collections**, and every product in a badged collection automatically inherits that collection's badge, so you label many products at once instead of one at a time.

Badges are managed from the Admin UI and read from the Shop API, are **channel-aware** (each channel sees only its own badges), and expose a ready-to-use `badges` field on `Product`, `ProductVariant`, and `SearchResult`.

## Features

- **Image badges** – Each badge is an uploaded asset rendered at a chosen position on the product
- **Collection-based** – Assign a badge to a collection; all products in that collection (and its sub-collections) inherit it
- **Configurable positions** – Restrict badges to a fixed set of positions (e.g. `top-left`, `top-right`); invalid positions are rejected
- **Channel-aware** – Badges are scoped per channel; admins and storefronts only see badges for the active channel
- **Admin UI** – Manage badges from a dedicated section in the Vendure Admin UI / Dashboard
- **Shop API** – Read badges directly off `Product`, `ProductVariant`, and `SearchResult`, or query a collection's badge

## Compatibility

Vendure **^3.6.0**

## Getting started

```bash
npm install @haus-tech/badge-plugin
```

Or with Yarn:

```bash
yarn add @haus-tech/badge-plugin
```

## Configuration

Add the plugin to your Vendure configuration in `vendure-config.ts`:

```typescript
import { BadgePlugin } from '@haus-tech/badge-plugin'

export const config = {
  plugins: [
    BadgePlugin.init({
      availablePositions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    }),
  ],
}
```

The plugin adds a `badge` table (plus its channel join table) to the database, so generate
and run a migration before starting the server:

```bash
npx vendure migrate
```

(Or generate one with your project's existing migration workflow.) Then restart the server.
Badges appear under their own section in the Admin UI.

## Configuration options

| Option               | Type       | Default                                                  | Description                                                                                                |
| -------------------- | ---------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `availablePositions` | `string[]` | `['top-left', 'top-right', 'bottom-left', 'bottom-right']` | Available positions selecteble in the ui   |

The configured positions are also exposed on the Admin API via the `getBadgePluginConfig`
query, so the Admin UI can offer them as choices.

## How it works

A **badge** holds an image asset, a position and a link to
one collection. Products are never badged directly, they inherit badges from the collections
they belong to:

1. **Create a badge** in the Admin UI: upload an image, pick a position, and assign it to a collection.
2. **Products inherit it** – every product in that collection, including products in its
   sub-collections, gets the badge automatically through the Shop API.
3. **The storefront reads it** – fetch the `badges` field on a product (or search result) and
   render each badge's image at its `position`.

Because badges are channel-aware, a badge is only visible in the channel it was created in.

## Permissions

Badge management is exposed on the Admin API and guarded by the standard Vendure catalog
permissions:

| Operation                            | Required permission |
| ------------------------------------ | ------------------- |
| Query badges / plugin config         | `ReadCatalog`       |
| Create a badge                       | `CreateCatalog`     |
| Update a badge                       | `UpdateCatalog`     |
| Delete a badge                       | `DeleteCatalog`     |

The Shop API badge queries are public, matching the rest of the Vendure shop API.

## Usage

### Admin UI

Once installed, manage badges from the dedicated **Badges** section in the Admin UI. From there you can:

- Create a badge by uploading an image asset and choosing a position.
- Assign the badge to a collection.
- Update or delete existing badges. Deleting a badge also deletes its image asset.

### Shop API

The plugin extends the Shop API with badge queries and adds a `badges` resolver field to
`Product`, `ProductVariant`, and `SearchResult`.

| Field / Query                            | Returns         | Description                                                              |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------------ |
| `Product.badges`                         | `[Badge!]!`     | Badges inherited from all collections the product belongs to             |
| `ProductVariant.badges`                  | `[Badge!]!`     | Badges from the variant's collections                                    |
| `SearchResult.badges`                    | `[Badge!]!`     | Badges for a search result (resolved via its product's collections)      |
| `badges(options)`                        | `BadgeList!`    | Paginated list of all badges in the active channel                       |
| `getBadgeFromCollection(collectionId)`   | `Badge`         | The badge assigned to a single collection, if any                        |
| `getBadgesFromCollections(collectionIds)`| `[Badge!]!`     | Badges assigned to any of the given collections                          |

The most common pattern is to read badges straight off a product:

```graphql
query ProductBadges($slug: String!) {
  product(slug: $slug) {
    id
    name
    badges {
      id
      position
      text
      asset {
        preview
      }
    }
  }
}
```

Or off search results, to render badges in a product listing:

```graphql
query Search($input: SearchInput!) {
  search(input: $input) {
    items {
      productName
      badges {
        position
        asset {
          preview
        }
      }
    }
  }
}
```

### Example integration

Fetch a product's badges from the Shop API and render each one at its `position`:

```ts
const res = await fetch('/shop-api', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `
      query ($slug: String!) {
        product(slug: $slug) {
          badges {
            position
            text
            asset { preview }
          }
        }
      }
    `,
    variables: { slug: 'my-product' },
  }),
})

const { data } = await res.json()
// data.product.badges -> [{ position: 'top-left', asset: { preview } }, ...]
// Render each badge image absolutely positioned over the product image using `position`.
```

## Resources

- [Vendure Plugin Documentation](https://docs.vendure.io/guides/developer-guide/plugins/)
- [Vendure Collections](https://docs.vendure.io/guides/core-concepts/collections/)
- [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) for generating TypeScript types for custom GraphQL types.