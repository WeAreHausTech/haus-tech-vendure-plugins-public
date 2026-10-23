import {
  Asset,
  CustomFieldConfig,
  RelationCustomFieldConfig,
  Type,
  VendureEntity,
} from '@vendure/core'

/** How the export writes one relation custom field by a column of the related entity. */
export interface ExportRelationLookup {
  /** The related entity's column written instead of the id, e.g. `sku`. */
  column: string
  /** The CSV header, `<owner>:<field>:<entity>:<column>`: the lookup header the import reads. */
  header: string
}

interface ProductCustomFields {
  Product: CustomFieldConfig[]
  ProductVariant: CustomFieldConfig[]
}

/**
 * Checks `exportOptions.relationLookups` against the custom field config and returns the lookup of
 * each `<owner>:<field>` key. Throws for a key that names no relation custom field, for an Asset
 * relation, and for a column that is not a plain text column of the related entity, since the
 * import could not read such a file back.
 */
export function resolveExportRelationLookups(
  lookups: Record<string, string> | undefined,
  customFields: ProductCustomFields,
  isTextColumn: (entity: Type<VendureEntity>, column: string) => boolean,
): Map<string, ExportRelationLookup> {
  const resolved = new Map<string, ExportRelationLookup>()
  for (const [key, column] of Object.entries(lookups ?? {})) {
    const [owner, fieldName, ...rest] = key.split(':')
    if ((owner !== 'product' && owner !== 'variant') || !fieldName || rest.length > 0) {
      throw configError(`'${key}' must be 'product:<field>' or 'variant:<field>'`)
    }
    const entityName = owner === 'product' ? 'Product' : 'ProductVariant'
    const config = customFields[entityName].find((field) => field.name === fieldName)
    if (!config) {
      throw configError(`${entityName} has no custom field named '${fieldName}'`)
    }
    if (config.type !== 'relation') {
      throw configError(`'${key}' is not a relation custom field`)
    }
    const { entity } = config as RelationCustomFieldConfig
    if (entity === Asset) {
      throw configError(`'${key}' relates to Asset, which is exported as assets`)
    }
    if (!isTextColumn(entity, column)) {
      throw configError(`'${column}' is not a text column of ${entity.name}`)
    }
    resolved.set(key, { column, header: `${key}:${entity.name.toLowerCase()}:${column}` })
  }
  return resolved
}

/**
 * The given column of each related row of one relation cell (a single row or a list), in order.
 * Soft-deleted rows and rows without a value are left out, since the import matches only live rows
 * by a value.
 */
export function relationLookupValues(fieldValue: unknown, column: string): string[] {
  const rows = Array.isArray(fieldValue) ? fieldValue : fieldValue == null ? [] : [fieldValue]
  return rows.flatMap((row) => {
    if (row === null || typeof row !== 'object') {
      return []
    }
    const { [column]: value, deletedAt } = row as Record<string, unknown>
    return deletedAt != null || value == null || value === '' ? [] : [String(value)]
  })
}

function configError(message: string): Error {
  return new Error(`exportOptions.relationLookups: ${message}`)
}
