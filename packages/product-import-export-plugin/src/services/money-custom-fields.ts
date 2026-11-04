import { CustomFieldConfig, InternalServerError } from '@vendure/core'

/** The component Vendure's dashboard and Admin UI enter an amount in major units with. */
const CURRENCY_COMPONENT = 'currency-form-input'

/**
 * Whether a custom field holds an amount in minor units, like Vendure's own price. The field
 * declares this itself: a single `int` the dashboard shows with the currency input, which reads
 * and writes major units. The CSV then gives and gets it in major units, as the `price` column.
 */
export function isMoneyCustomField(config: CustomFieldConfig): boolean {
  return (
    config.type === 'int' && config.list !== true && config.ui?.component === CURRENCY_COMPONENT
  )
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
