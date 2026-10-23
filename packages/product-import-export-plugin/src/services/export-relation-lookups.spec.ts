import { Asset, CustomFieldConfig, Facet, ProductVariant } from '@vendure/core'
import { describe, expect, it } from 'vitest'
import { relationLookupValues, resolveExportRelationLookups } from './export-relation-lookups'

const customFields = {
  Product: [
    { name: 'brand', type: 'relation', entity: Facet },
    { name: 'brands', type: 'relation', entity: Facet, list: true },
    { name: 'image', type: 'relation', entity: Asset },
    { name: 'note', type: 'string' },
  ] as CustomFieldConfig[],
  ProductVariant: [
    { name: 'baseVariant', type: 'relation', entity: ProductVariant },
  ] as CustomFieldConfig[],
}

/** `code` on Facet and `sku` on ProductVariant are text columns, nothing else is. */
const isTextColumn = (entity: unknown, column: string) =>
  (entity === Facet && column === 'code') || (entity === ProductVariant && column === 'sku')

const resolve = (lookups: Record<string, string> | undefined) =>
  resolveExportRelationLookups(lookups, customFields, isTextColumn)

describe('resolveExportRelationLookups', () => {
  it('gives each configured field the lookup header the import reads', () => {
    const lookups = resolve({
      'product:brand': 'code',
      'product:brands': 'code',
      'variant:baseVariant': 'sku',
    })
    expect(Object.fromEntries(lookups)).toEqual({
      'product:brand': { column: 'code', header: 'product:brand:facet:code' },
      'product:brands': { column: 'code', header: 'product:brands:facet:code' },
      'variant:baseVariant': { column: 'sku', header: 'variant:baseVariant:productvariant:sku' },
    })
  })

  it('has no lookups without the option', () => {
    expect(resolve(undefined).size).toBe(0)
  })

  it('refuses a key that is not <owner>:<field>', () => {
    expect(() => resolve({ brand: 'code' })).toThrow(
      `exportOptions.relationLookups: 'brand' must be 'product:<field>' or 'variant:<field>'`,
    )
  })

  it('refuses a field that does not exist', () => {
    expect(() => resolve({ 'product:missing': 'code' })).toThrow(
      `exportOptions.relationLookups: Product has no custom field named 'missing'`,
    )
  })

  it('refuses a field that is not a relation', () => {
    expect(() => resolve({ 'product:note': 'code' })).toThrow(
      `exportOptions.relationLookups: 'product:note' is not a relation custom field`,
    )
  })

  it('refuses an Asset relation, which the export writes as asset urls', () => {
    expect(() => resolve({ 'product:image': 'source' })).toThrow(
      `exportOptions.relationLookups: 'product:image' relates to Asset, which is exported as assets`,
    )
  })

  it('refuses a column that is not a text column of the related entity', () => {
    expect(() => resolve({ 'product:brand': 'id' })).toThrow(
      `exportOptions.relationLookups: 'id' is not a text column of Facet`,
    )
  })
})

describe('relationLookupValues', () => {
  it('reads the column of a single related row', () => {
    expect(relationLookupValues({ id: 1, code: 'C-1' }, 'code')).toEqual(['C-1'])
  })

  it('reads the column of every related row of a list, in order', () => {
    expect(
      relationLookupValues(
        [
          { id: 2, code: 'B' },
          { id: 1, code: 'A' },
        ],
        'code',
      ),
    ).toEqual(['B', 'A'])
  })

  it('leaves out rows without a value', () => {
    expect(
      relationLookupValues(
        [{ id: 1, code: '' }, { id: 2, code: null }, { id: 3 }, { id: 4, code: 'D' }],
        'code',
      ),
    ).toEqual(['D'])
  })

  it('leaves out soft-deleted rows, which the import does not match', () => {
    expect(
      relationLookupValues(
        [
          { id: 1, code: 'A', deletedAt: new Date() },
          { id: 2, code: 'B', deletedAt: null },
        ],
        'code',
      ),
    ).toEqual(['B'])
  })

  it('has no values for an empty relation', () => {
    expect(relationLookupValues(null, 'code')).toEqual([])
    expect(relationLookupValues([], 'code')).toEqual([])
  })
})
