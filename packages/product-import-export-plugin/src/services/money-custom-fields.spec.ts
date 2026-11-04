import { CustomFieldConfig } from '@vendure/core'
import { describe, expect, it } from 'vitest'
import {
  minorUnitsToMoneyCell,
  moneyCellToMinorUnits,
  resolveMoneyCustomFields,
} from './money-custom-fields'

const customFields = {
  Product: [{ name: 'deposit', type: 'int' }] as CustomFieldConfig[],
  ProductVariant: [
    { name: 'listPrice', type: 'int' },
    { name: 'weight', type: 'float' },
    { name: 'tiers', type: 'int', list: true },
  ] as CustomFieldConfig[],
}

const resolve = (keys: string[] | undefined) => resolveMoneyCustomFields(keys, customFields)

describe('resolveMoneyCustomFields', () => {
  it('keeps each configured int field', () => {
    expect([...resolve(['product:deposit', 'variant:listPrice'])]).toEqual([
      'product:deposit',
      'variant:listPrice',
    ])
  })

  it('has no fields without the option', () => {
    expect(resolve(undefined).size).toBe(0)
  })

  it.each([
    ['listPrice', `'listPrice' must be 'product:<field>' or 'variant:<field>'`],
    ['order:listPrice', `'order:listPrice' must be 'product:<field>' or 'variant:<field>'`],
    ['variant:missing', `ProductVariant has no custom field named 'missing'`],
    ['variant:weight', `'variant:weight' is not a single int custom field`],
    ['variant:tiers', `'variant:tiers' is not a single int custom field`],
  ])('rejects %s', (key, message) => {
    expect(() => resolve([key])).toThrow(`moneyCustomFields: ${message}`)
  })
})

describe('money cells', () => {
  it.each([
    ['164', 16400],
    [' 164.5 ', 16450],
    ['-3', -300],
  ])('reads %s as %i minor units', (cell, minor) => {
    expect(moneyCellToMinorUnits('listPrice', cell)).toBe(minor)
  })

  it.each(['164 kr', '164,5', 'abc'])('rejects %s', (cell) => {
    expect(() => moneyCellToMinorUnits('listPrice', cell)).toThrow(
      `Custom field "listPrice" must be a number, got "${cell}"`,
    )
  })

  it('writes minor units as major units', () => {
    expect(minorUnitsToMoneyCell(16450)).toBe(164.5)
  })
})
