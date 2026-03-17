import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core'
import { AdminUiExtension } from '@vendure/ui-devkit/compiler'
import * as path from 'path'
import { uniq } from 'lodash'

import { EXPORT_STORAGE_STRATEGY, PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS } from './constants'

import { PluginInitOptions } from './types'
/* Controllers */
import { ProductImportController } from './api/product-import.controller'
import { ProductExportController } from './api/product-export.controller'
import { ProductImportExportPluginController } from './api/plugin.controller'
/* Providers */
import { ProductImporter } from './providers/import-providers/product-importer'
import { ImportParser } from './providers/import-providers/import-parser'
import { ExtendedAssetImporter } from './providers/import-providers/asset-importer'
/* Services */
import { ProductImportService } from './services/product-import.service'
import { ExtendedFastImporterService } from './services/extended-fast-importer.service'
import { ProductExportService } from './services/product-export.service'
import { ProductExportQueueService } from './services/product-export-queue.service'
import { LocalExportStorageStrategy } from './services/export-storage/local-export-storage-strategy'
import { S3ExportStorageStrategy } from './services/export-storage/s3-export-storage-strategy'
import { isS3Storage } from './services/export-storage.util'

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [
    {
      provide: PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS,
      useFactory: () => ProductImportExportPlugin.options,
    },
    {
      provide: EXPORT_STORAGE_STRATEGY,
      useFactory: () => {
        const storage = ProductImportExportPlugin.options?.exportOptions?.storage
        if (isS3Storage(storage)) {
          return new S3ExportStorageStrategy({ storage })
        }

        return new LocalExportStorageStrategy({
          baseDir: path.join(process.cwd(), 'static', 'exports'),
        })
      },
    },
    ProductImportService,
    ProductImporter,
    ExtendedFastImporterService,
    ImportParser,
    ExtendedAssetImporter,
    ProductExportService,
    ProductExportQueueService,
  ],
  controllers: [
    ProductImportController,
    ProductExportController,
    ProductImportExportPluginController,
  ],

  configuration: (config) => {
    // Plugin-specific configuration
    // such as custom fields, custom permissions,
    // strategies etc. can be configured here by
    // modifying the `config` object.
    config.customFields.Asset.push({
      name: 'hash',
      type: 'string',
      internal: true,
    })
    return config
  },
  dashboard: './dashboard/index.tsx',
  compatibility: '^2.0.0 || ^3.0.0',
})
export class ProductImportExportPlugin {
  static options: PluginInitOptions

  static init(options: PluginInitOptions): Type<ProductImportExportPlugin> {
    // Setup import options
    if (!options.importOptions.defaultOptions) {
      options.importOptions.defaultOptions = {
        updateProductSlug: true,
        restoreSoftDeleted: true,
      }
    }

    // Ensure exportOptions exists
    if (!options.exportOptions) {
      options.exportOptions = {}
    }

    // Setup export options
    if (!options.exportOptions.defaultFileName) {
      options.exportOptions.defaultFileName = 'products_export.csv'
    }
    if (!options.exportOptions.exportAssetsAsOptions) {
      options.exportOptions.exportAssetsAsOptions = ['url', 'json']
    }
    if (!options.exportOptions.defaultExportAssetsAs) {
      options.exportOptions.defaultExportAssetsAs = 'url'
    }

    if (!options.exportOptions.defaultExportFields) {
      options.exportOptions.defaultExportFields = [
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
      ]
    }

    if (options.exportOptions.defaultExportFields) {
      options.exportOptions.defaultExportFields = uniq([
        ...options.exportOptions.defaultExportFields,
        'name',
        'sku',
      ])
    }

    if (!options.exportOptions.requiredExportFields) {
      options.exportOptions.requiredExportFields = ['name', 'sku']
    }

    if (options.exportOptions.requiredExportFields) {
      options.exportOptions.requiredExportFields = uniq([
        ...options.exportOptions.requiredExportFields,
        'name',
        'sku',
      ])
    }

    this.options = options
    return ProductImportExportPlugin
  }

  static ui: AdminUiExtension = {
    id: 'product-importer-ui',
    extensionPath: path.join(__dirname, 'ui'),
    translations: {
      en: path.join(__dirname, 'ui/translations/en.json'),
      sv: path.join(__dirname, 'ui/translations/sv.json'),
    },
    routes: [{ route: 'product-importer', filePath: 'routes.ts' }],
    providers: ['providers.ts'],
  }
}

declare module '@vendure/core/dist/entity/custom-entity-fields' {
  interface CustomAssetFields {
    hash: string
  }
}
