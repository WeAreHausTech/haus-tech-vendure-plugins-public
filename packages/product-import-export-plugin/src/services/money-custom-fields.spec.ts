import { CustomFieldConfig } from '@vendure/core'
import { describe, expect, it } from 'vitest'
import {
  isMoneyCustomField,
  minorUnitsToMoneyCell,
  moneyCellToMinorUnits,
} from './money-custom-fields'

const currency = { component: 'currency-form-input' }

describe('isMoneyCustomField', () => {
  it('is an int field shown with the currency input', () => {
    expect(isMoneyCustomField({ name: 'listPrice', type: 'int', ui: currency })).toBe(true)
  })

  it.each([
    ['a plain int', { name: 'packSize', type: 'int' }],
    ['an int with another component', { name: 'rank', type: 'int', ui: { component: 'x' } }],
    ['a float with the currency input', { name: 'rate', type: 'float', ui: currency }],
    [
      'an int list with the currency input',
      { name: 'tiers', type: 'int', list: true, ui: currency },
    ],
  ])('is not %s', (_, config) => {
    expect(isMoneyCustomField(config as CustomFieldConfig)).toBe(false)
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
