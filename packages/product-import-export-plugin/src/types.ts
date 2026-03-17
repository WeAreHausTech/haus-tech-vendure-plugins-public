import { ID } from '@vendure/core'
import {
  ParsedProduct,
  ParsedProductWithVariants,
} from './providers/import-providers/import-parser'
import type { Injector } from '@vendure/core'
import type { ExportStorageStrategy } from './services/export-storage/export-storage-strategy'

/**
 * @description
 * The plugin can be configured using the following options:
 */
type ImportOptions = {
  /**
   * @description
   * updateProductSlug: If true, the product slug will be updated based on the `name` field in the CSV file.
   */
  updateProductSlug?: boolean
  /**
   * @description
   * restoreSoftDeleted: If true (default), soft-deleted Products and Variants found by id/SKU
   * will be restored during import. If false, deleted entities will remain deleted.
   */
  restoreSoftDeleted?: boolean
}
export interface PluginInitOptions {
  importOptions: {
    visibleOptions?: Array<keyof ImportOptions>
    defaultOptions?: ImportOptions
  }
  exportOptions: {
    defaultFileName?: string
    exportAssetsAsOptions?: Array<'url' | 'json'>
    defaultExportAssetsAs?: 'url' | 'json'
    defaultExportFields?: ExportFields
    requiredExportFields?: ExportFields
    /**
     * @description
     * Preferred configuration: provide an export storage strategy instance directly.
     * This matches Vendure's strategy-based plugin configuration style.
     */
    storageStrategy?: ExportStorageStrategy
    /**
     * @description
     * Preferred configuration: provide a factory which can use Vendure's DI via the Injector.
     */
    storageStrategyFactory?: (injector: Injector) => ExportStorageStrategy | Promise<ExportStorageStrategy>
    /**
     * @description
     * Optional. If omitted, the default local-disk strategy is used.
     */
  }
}

export type ParsedProductWithId = ParsedProductWithVariants & {
  product: ParsedProduct & { productId: number | null }
}

export type JsonAsset = {
  id?: ID
  url: string
  name?: string
}

type ExportFields = Array<ProductFields | VariantFields>
type ProductFields =
  | 'productId'
  | 'name'
  | 'slug'
  | 'description'
  | 'assets'
  | 'facets'
  | 'optionGroups'

type VariantFields =
  | 'sku'
  | 'optionValues'
  | 'price'
  | 'taxCategory'
  | 'stockOnHand'
  | 'trackInventory'
  | 'variantAssets'
  | 'variantFacets'
  | 'enabled'

export type UpdatingStrategy = 'replace' | 'merge'
