import { Injector, PluginCommonModule, Type, VendurePlugin } from '@vendure/core'
import { AdminUiExtension } from '@vendure/ui-devkit/compiler'
import { ModuleRef } from '@nestjs/core'
import * as path from 'path'
import { uniq } from 'lodash'

import {
  EXPORT_STORAGE_STRATEGY,
  IMPORT_JOB_STORAGE_STRATEGY,
  PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS,
} from './constants'

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
import { LocalImportJobStorageStrategy } from './services/import-storage/local-import-job-storage-strategy'

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [
    {
      provide: PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS,
      useFactory: () => ProductImportExportPlugin.options,
    },
    {
      provide: EXPORT_STORAGE_STRATEGY,
      useFactory: async (moduleRef: ModuleRef) => {
        const exportOptions = ProductImportExportPlugin.options?.exportOptions
        const injector = new Injector(moduleRef)

        if (exportOptions?.storageStrategy) {
          return exportOptions.storageStrategy
        }

        if (exportOptions?.storageStrategyFactory) {
          return await exportOptions.storageStrategyFactory(injector)
        }

        return new LocalExportStorageStrategy({
          baseDir: path.join(process.cwd(), 'static', 'exports'),
        })
      },
      inject: [ModuleRef],
    },
    {
      provide: IMPORT_JOB_STORAGE_STRATEGY,
      useFactory: async (moduleRef: ModuleRef) => {
        const importOptions = ProductImportExportPlugin.options?.importOptions
        const injector = new Injector(moduleRef)

        if (importOptions?.storageStrategy) {
          return importOptions.storageStrategy
        }

        if (importOptions?.storageStrategyFactory) {
          return await importOptions.storageStrategyFactory(injector)
        }

        return new LocalImportJobStorageStrategy({
          baseDir: path.join(process.cwd(), 'static', 'imports-tmp'),
        })
      },
      inject: [ModuleRef],
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
    if (!options.importOptions.importJobStorage) {
      options.importOptions.importJobStorage = 'local'
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
        'optionGroups',
        'optionValues',
      ])
    }

    if (!options.exportOptions.requiredExportFields) {
      options.exportOptions.requiredExportFields = ['name', 'sku', 'optionGroups', 'optionValues']
    }

    if (options.exportOptions.requiredExportFields) {
      options.exportOptions.requiredExportFields = uniq([
        ...options.exportOptions.requiredExportFields,
        'name',
        'sku',
        'optionGroups',
        'optionValues',
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
