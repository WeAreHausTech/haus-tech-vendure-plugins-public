---
name: product-import-export-plugin
title: Product Import Export Plugin
description: Vendure plugin designed to simplify the process of importing and exporting product data.
version: 3.1.3
tags: [vendure, plugin, import, export]
---

# Product Import Export Plugin

The Product Import Export Plugin is a Vendure plugin designed to simplify the process of importing and exporting product data. It provides an efficient way to manage large catalogs, migrate data between environments, and integrate with external systems.

## Functionality

This plugin enables the following features:

- Importing product data from CSV files with validation and support for custom fields.
- Exporting product data to CSV files with customizable fields, including custom fields and asset data.
- Integration with the Vendure Admin UI for importing and exporting products.
- Configurable options for import/export behavior, such as updating product slugs and handling translations.

## Use Cases

The Product Import Export Plugin is ideal for:

- Bulk uploading product data into a Vendure instance.
- Exporting product data for reporting or integration with third-party systems.
- Migrating product data between different Vendure environments.

## Installation

1. Clone the repository or copy the `product-import-export-plugin` directory into your project.
2. Navigate to the plugin directory:

   ```bash
   cd packages/product-import-export-plugin
   ```

3. Install the dependencies:

   ```bash
   yarn
   ```

4. Build the plugin:

   ```bash
   yarn build
   ```

5. Add the plugin to your Vendure configuration:

   ```typescript
   import { ProductImportExportPlugin } from 'product-import-export-plugin';

   export const config = {
     plugins: [
       ProductImportExportPlugin,
       // other plugins
     ],
   };
   ```

## Usage

### Importing Products

1. Prepare a CSV file with the product data. Ensure the file matches the required format, including headers for custom fields if applicable.
2. Use the Admin UI or API to upload the CSV file for import.
3. The plugin will validate and process the file, creating or updating products in the database.

### Exporting Products

1. Use the Admin UI or API to select products for export.
2. Customize the fields to be included in the export, such as custom fields and asset data.
3. Download the generated CSV file for further use.

## Testing

1. Run the end-to-end tests:

   ```bash
   yarn test
   ```

2. Modify the tests in `test/e2e.spec.ts` to suit your plugin's functionality.

## Resources

- [Vendure Plugin Documentation](https://www.vendure.io/docs/plugins/)
- [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) for generating TypeScript types for custom GraphQL types.
