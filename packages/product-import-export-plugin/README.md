# Product Import Export Plugin

The Product Import Export Plugin is a Vendure plugin designed to simplify the process of importing and exporting product data. It provides an efficient way to manage large catalogs, migrate data between environments, and integrate with external systems.

## Functionality

This plugin enables the following features:

- Importing product data from CSV files with validation and support for custom fields.
- Exporting product data to CSV files with customizable fields, including custom fields and asset data.
- Support for **variants**, **assets**, and **facets** (product-level and variant-level).
- Integration with the Vendure Admin UI and Dashboard for importing and exporting products.
- Configurable options for import/export behavior, such as updating product slugs and handling translations.

## Use Cases

The Product Import Export Plugin is ideal for:

- Bulk uploading product data into a Vendure instance.
- Exporting product data for reporting or integration with third-party systems.
- Migrating product data between different Vendure environments.

## Installation

This plugin requires `@vendure/email-plugin` to be installed.

```bash
npm install @haus-tech/product-import-export-plugin @vendure/email-plugin
# or
yarn add @haus-tech/product-import-export-plugin @vendure/email-plugin
```

## Configuration

Add the plugin to your Vendure configuration. The plugin **requires** the `init()` method to be called with options:

```typescript
import { ProductImportExportPlugin } from '@haus-tech/product-import-export-plugin'

export const config = {
  plugins: [
    ProductImportExportPlugin.init({
      importOptions: {
        defaultOptions: {
          updateProductSlug: true,
          restoreSoftDeleted: true,
        },
      },
      exportOptions: {
        defaultFileName: 'products_export.csv',
        exportAssetsAsOptions: ['url', 'json'],
        defaultExportAssetsAs: 'url',
        defaultExportFields: [
          'name',
          'sku',
          'slug',
          'description',
          'assets',
          'facets',
          'optionGroups',
          'optionValues',
          'price',
          'taxCategory',
          'stockOnHand',
          'trackInventory',
          'variantAssets',
          'variantFacets',
        ],
        requiredExportFields: ['name', 'sku'],
      },
    }),
    // other plugins
  ],
}
```

## Usage

### Importing Products

1. Prepare a CSV file with the product data. Ensure the file matches the required format, including headers for custom fields if applicable.
2. Use the Admin UI or Dashboard to upload the CSV file for import.
3. The plugin will validate and process the file, creating or updating products in the database.
4. Supports product and variant facets, assets (URLs or local paths), option groups, and custom fields.

### Exporting Products

1. Use the Admin UI or Dashboard to select products for export.
2. Customize the fields to be included in the export (assets, facets, custom fields, etc.).
3. Choose to export assets as URLs or JSON.
4. Download the generated CSV file for further use.

## Email notification on export complete

Add the `productExportedHandler` to your email plugin handlers to send an email when a product export is complete:

```typescript
import { DefaultEmailPlugin } from '@vendure/email-plugin'
import { productExportedHandler } from '@haus-tech/product-import-export-plugin'

export const config = {
  plugins: [
    DefaultEmailPlugin.init({
      // ... your email config
      handlers: [productExportedHandler],
    }),
    // ...
  ],
}
```

## Testing

1. Run the tests:

   ```bash
   yarn test
   ```

## Resources

- [Vendure Plugin Documentation](https://www.vendure.io/docs/plugins/)
- [Vendure Import/Export Guide](https://www.vendure.io/docs/guides/developer-guide/importing-data/)
