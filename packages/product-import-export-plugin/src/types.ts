import { ID } from '@vendure/core'
import {
  ParsedProduct,
  ParsedProductWithVariants,
} from './providers/import-providers/import-parser'
import type { Injector, Product, ProductVariant, RequestContext } from '@vendure/core'
import { ExportStorageStrategy } from './services/export-storage/export-storage-strategy'
import { ImportJobStorageStrategy } from './services/import-storage/import-job-storage-strategy'
import { ImportRowValidationStrategy } from './strategies/import-row-validation-strategy'

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
  /**
   * @description
   * Preferred configuration: provide an import job storage strategy instance directly.
   */
  storageStrategy?: ImportJobStorageStrategy
  /**
   * @description
   * Preferred configuration: provide a factory which can use Vendure's DI via the Injector.
   */
  storageStrategyFactory?: (
    injector: Injector,
  ) => ImportJobStorageStrategy | Promise<ImportJobStorageStrategy>
  /**
   * @description
   * Deprecated. Kept for backward compatibility.
   * Use `storageStrategy` or `storageStrategyFactory` instead.
   */
  importJobStorage?: 'local' | 's3'
}
/**
 * @description
 * Options passed to {@link ProductImportExportPlugin}.init to configure import and
 * export behaviour, including which storage strategy backs each operation.
 *
 * @category Options
 */
export interface PluginInitOptions {
  importOptions: {
    visibleOptions?: Array<keyof ImportOptions>
    defaultOptions?: ImportOptions
    storageStrategy?: ImportOptions['storageStrategy']
    storageStrategyFactory?: ImportOptions['storageStrategyFactory']
    importJobStorage?: ImportOptions['importJobStorage']
    /**
     * @description
     * Checks the rows of an import file before anything is written: at upload, before the file is
     * stored, and again when the import job starts. Defaults to
     * {@link DefaultImportRowValidationStrategy}, which accepts every row.
     */
    rowValidationStrategy?: ImportRowValidationStrategy
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
    storageStrategyFactory?: (
      injector: Injector,
    ) => ExportStorageStrategy | Promise<ExportStorageStrategy>
    /**
     * @description
     * Optional. If omitted, the default local-disk strategy is used.
     */
    /**
     * @description
     * Optional. Additional CSV columns appended after the built-in export fields.
     * Each column's `name` must not contain `:` and must not collide with a
     * built-in export field name; names must also be unique. Validated at
     * plugin init time.
     */
    customExportColumns?: CustomExportColumn[]
    /**
     * @description
     * Optional. Writes the chosen relation custom fields by a column of the related row instead
     * of its id, keyed `<owner>:<field>` with the column as value, e.g.
     * `{ 'variant:baseVariant': 'sku', 'product:brand': 'code' }`. The CSV header becomes
     * `<owner>:<field>:<entity>:<column>`, the lookup header the import reads, so the file
     * imports again, also into another database. The column must be a plain text column of the
     * related entity, and the field must not relate to `Asset`; the application does not start
     * otherwise. Soft-deleted related rows and rows without a value in the column are left out
     * of the cell, since the import matches only live rows by a value.
     */
    relationLookups?: Record<string, string>
  }
}

/**
 * @description
 * A custom column added to the product export CSV. Only included in the output
 * when its `name` is present in the caller-selected export fields.
 *
 * @category Options
 */
export interface CustomExportColumn {
  /** CSV column name. No ':' and no collision with built-in export fields. */
  name: string
  /** Awaited once per export job before the first resolve. Use to reset caches. */
  onExportStart?: () => void | Promise<void>
  /** Called per variant row; return value is written to the cell ('' for null/undefined). */
  resolve: (
    ctx: RequestContext,
    injector: Injector,
    product: Product,
    variant: ProductVariant,
  ) => Promise<unknown> | unknown
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
  | 'id'
  | 'name'
  | 'slug'
  | 'description'
  | 'assets'
  | 'channels'
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
