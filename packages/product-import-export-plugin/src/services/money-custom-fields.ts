import { CustomFieldConfig, InternalServerError } from '@vendure/core'

interface ProductCustomFields {
  Product: CustomFieldConfig[]
  ProductVariant: CustomFieldConfig[]
}

/**
 * Checks `moneyCustomFields` against the custom field config and returns the `<owner>:<field>`
 * keys. Throws for a key that names no custom field, and for a field that is not a single `int`,
 * since an amount in minor units is stored as an integer like Vendure's own price.
 */
export function resolveMoneyCustomFields(
  keys: string[] | undefined,
  customFields: ProductCustomFields,
): Set<string> {
  const resolved = new Set<string>()
  for (const key of keys ?? []) {
    const [owner, fieldName, ...rest] = key.split(':')
    if ((owner !== 'product' && owner !== 'variant') || !fieldName || rest.length > 0) {
      throw configError(`'${key}' must be 'product:<field>' or 'variant:<field>'`)
    }
    const entityName = owner === 'product' ? 'Product' : 'ProductVariant'
    const config = customFields[entityName].find((field) => field.name === fieldName)
    if (!config) {
      throw configError(`${entityName} has no custom field named '${fieldName}'`)
    }
    if (config.type !== 'int' || config.list === true) {
      throw configError(`'${key}' is not a single int custom field`)
    }
    resolved.add(key)
  }
  return resolved
}

/** The minor units of an amount the CSV gives in major units (`164.5` is 16450), as for `price`. */
export function moneyCellToMinorUnits(fieldName: string, cell: string): number {
  const amount = Number(cell.trim())
  if (!Number.isFinite(amount)) {
    throw new InternalServerError(`Custom field "${fieldName}" must be a number, got "${cell}"`)
  }
  return Math.round(amount * 100)
}

/** The major units the CSV gets for an amount stored in minor units (16450 is `164.5`). */
export function minorUnitsToMoneyCell(value: number): number {
  return value / 100
}

function configError(message: string): Error {
  return new Error(`moneyCustomFields: ${message}`)
}
