---
name: badge-plugin
title: Badge Plugin
description: Vendure plugin that allows you to manage and display badges for products in your e-commerce store.
version: 4.0.7
tags: [vendure, plugin, badge]
---

# Badge Plugin

The `Badge Plugin` is a Vendure plugin that allows you to manage and display badges for products in your e-commerce store. Badges can be used to highlight specific attributes of products, such as "New Arrival," "Best Seller," or "Limited Edition." This plugin provides both admin and shop APIs to create, update, delete, and query badges.

## Functionality

- Assign badges to collections (badges can be indirectly associated with products via collections).
- Customize badge positions (e.g., top-left, top-right, etc.).
- Add an optional text label to a badge (e.g., "New Arrival", "Best Seller").
- Manage badges through the Vendure Admin UI.
- Display badges on the storefront using the shop API.

## Use Cases

The Badge Plugin is ideal for:

- Highlighting specific product attributes to attract customer attention.
- Managing promotional badges for collections or individual products.
- Enhancing the visual appeal of your storefront with customizable badge positions.

## Installation

To install the `Badge Plugin`, follow these steps:

1. Install the plugin package:

   ```bash
   yarn add @haus-tech/badge-plugin
   ```

   Or, if using npm:

   ```bash
   npm install @haus-tech/badge-plugin
   ```

2. Add the plugin to your Vendure configuration in `vendure-config.ts`:

   ```ts
   import { BadgePlugin } from '@haus-tech/badge-plugin';

   export const config = {
     plugins: [
       BadgePlugin.init({
         availablePositions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
       }),
     ],
   };
   ```

3. Generate and run a database migration. The plugin adds a `badge` table, so your
   project needs a migration before the server will start:

   ```bash
   npx vendure migrate
   ```

   (Or generate one with your project's existing migration workflow.)

4. Restart your Vendure server.

## Permissions

Badge management is exposed on the Admin API and guarded by the standard Vendure
catalog permissions:

| Operation                                      | Required permission |
| ---------------------------------------------- | ------------------- |
| Query badges / plugin config                   | `ReadCatalog`       |
| Create a badge                                 | `CreateCatalog`     |
| Update a badge                                 | `UpdateCatalog`     |
| Delete a badge                                 | `DeleteCatalog`     |

The shop API badge queries are public, matching the rest of the Vendure shop API.

## Usage

### Admin UI

Once the plugin is installed, you can manage badges directly from the Vendure Admin UI. A new "Badges" section will appear under the "Catalog" menu. From there, you can:

- Create new badges by uploading an asset and specifying its position.
- Assign badges to specific collections.
- Update or delete existing badges.

### Shop API

The plugin extends the shop API to expose badge data. You can query badges for collections using GraphQL. For example:

```graphql
query GetBadges {
  badges {
    items {
      id
      position
      text
      asset {
        preview
      }
    }
    totalItems
  }
}
```

### Example Integration

To display badges on your storefront, use the shop API to fetch badge data and render it in your frontend. For example:

```ts
fetch('/shop-api', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `
      query {
        badges {
          items {
            id
            position
            asset {
              preview
            }
          }
        }
      }
    `,
  }),
})
  .then((res) => res.json())
  .then((data) => {
    console.log(data);
  });
```

## Resources

- [Vendure Plugin Documentation](https://docs.vendure.io/guides/developer-guide/plugins/)
- [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) for generating TypeScript types for custom GraphQL types.
