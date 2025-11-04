---
name: add-note-to-order-plugin
title: Add Note to Order Plugin
description: Vendure plugin that allows administrators and customers to add and manage notes on orders.
version: 3.0.0-rc1
tags: [vendure, plugin, order, note]
---

# Add Note to Order Plugin test test test

The `Add Note to Order Plugin` is a Vendure plugin that enables administrators and customers to add, view, and manage notes on orders. This plugin enhances communication and record-keeping by allowing notes to be associated with specific orders.

## Functionality

- Add notes to orders, either by administrators or customers.
- Mark notes as read to track communication status.
- View all notes or filter by unread notes.
- Integrates with the Vendure Admin UI to display notes in a widget.
- Provides GraphQL APIs for managing notes programmatically.

## Use Cases

The Add Note to Order Plugin is ideal for:

- Keeping a record of customer communications related to specific orders.
- Allowing administrators to leave internal notes for order management.
- Enabling customers to add notes or messages to their orders.

## Installation

To install the `Add Note to Order Plugin`, follow these steps:

1. Install the plugin package:

   ```bash
   yarn add @haus-tech/add-note-to-order-plugin
   ```

   Or, if using npm:

   ```bash
   npm install @haus-tech/add-note-to-order-plugin
   ```

2. Add the plugin to your Vendure configuration in `vendure-config.ts`:

   ```ts
   import { AddNoteToOrderPlugin } from '@haus-tech/add-note-to-order-plugin';

   export const config = {
     plugins: [
       AddNoteToOrderPlugin,
     ],
   };
   ```

3. Restart your Vendure server.

## Usage

### Admin UI

Once the plugin is installed, a new widget will appear in the Vendure Admin UI dashboard. This widget allows administrators to:

- View all notes or filter by unread notes.
- Mark notes as read.
- Navigate to the associated order for more details.

### Shop API

The plugin extends the shop API to allow customers to add notes to their orders. It also provides queries for retrieving notes associated with an order. Example GraphQL queries include:

#### Add a Note to an Order

```graphql
mutation AddNoteToOrder($input: AddNoteToOrderInput!) {
  addNoteToOrder(input: $input) {
    id
    code
    notes {
      id
      data {
        note
        fromCustomer
        readAt
      }
    }
  }
}
```

#### Retrieve Notes for an Order

```graphql
query OrderNotes($orderId: ID!) {
  order(id: $orderId) {
    id
    notes {
      id
      data {
        note
        fromCustomer
        readAt
      }
    }
  }
}
```

## Testing

1. Run `yarn test` to execute the tests.
2. Implement additional tests to cover your specific use cases.

## Publish to NPM

1. Make sure you are [logged in to NPM](https://docs.npmjs.com/cli/v9/commands/npm-login).
2. Build the plugin:

   ```bash
   yarn build
   ```

3. Publish the plugin:

   ```bash
   yarn publish
   ```

## Resources

- [Vendure Plugin Documentation](https://www.vendure.io/docs/plugins/)
- [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) for generating TypeScript types for custom GraphQL types.
