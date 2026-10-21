import { InjectableStrategy, RequestContext } from '@vendure/core'

/**
 * @description
 * One product of an import file as the {@link ImportRowValidationStrategy} sees it: the product's
 * first row and every variant row under it, with the line each came from (the header is line 1,
 * blank and comma-only lines are not counted).
 *
 * Custom fields are keyed as the Admin API input takes them: a relation field under its input name
 * (`<name>Id`, or `<name>Ids` for a list) holding id strings, whether the file gave ids or a lookup
 * column (`:sku`, `:code`) that has been resolved. A value that could not be resolved is left out
 * (the lookup error is reported anyway), and so is an empty cell, which leaves the relation as it
 * is. An Asset relation keeps its raw cell under the field name, since assets are only created when
 * the row is written. Other custom fields keep their cell text under the field name.
 * `product.customFields` holds the first translation's custom fields, which include every
 * non-localised field.
 *
 * The groups are copies: changing them changes nothing that is imported.
 *
 * @category Import
 */
export interface ImportRowGroup {
  line: number
  product: {
    customFields: Record<string, unknown>
    translations: unknown[]
    [key: string]: unknown
  }
  variants: Array<{
    line: number
    variant: { sku: string; customFields: Record<string, unknown>; [key: string]: unknown }
  }>
}

/**
 * @description
 * A problem with one row. Shown to the uploader as `Row <line>: <message>`.
 *
 * @category Import
 */
export interface ImportRowError {
  line: number
  message: string
}

/**
 * @description
 * Checks the rows of an import file before anything is written. It runs twice: when the file is
 * uploaded, before it is stored and queued (the upload answers `400` with the errors), and again
 * when the import job starts, since data can change while the job waits (the job fails with the
 * errors and imports nothing). Errors from relation lookups and from this strategy come back in
 * one list.
 *
 * Set it with `ProductImportExportPlugin.init({ importOptions: { rowValidationStrategy } })`.
 * `init(injector)` and `destroy()` are called when the application starts and stops.
 *
 * @category Import
 */
export interface ImportRowValidationStrategy extends InjectableStrategy {
  validate(ctx: RequestContext, rows: ImportRowGroup[]): Promise<ImportRowError[]>
}

/**
 * @description
 * The default {@link ImportRowValidationStrategy}: accepts every row.
 *
 * @category Import
 */
export class DefaultImportRowValidationStrategy implements ImportRowValidationStrategy {
  async validate(): Promise<ImportRowError[]> {
    return []
  }
}
