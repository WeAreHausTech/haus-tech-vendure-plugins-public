import { CustomFieldConfig, Facet, Product, ProductVariant } from '@vendure/core'
import { describe, expect, it } from 'vitest'
import { splitSelfRelationCustomFields } from './self-relation-custom-fields'

const fields = [
  { name: 'brand', type: 'relation', entity: Facet },
  { name: 'baseVariant', type: 'relation', entity: ProductVariant },
  { name: 'note', type: 'string' },
] as CustomFieldConfig[]

describe('splitSelfRelationCustomFields', () => {
  it('keeps relations to other entities and separates self relations', () => {
    const split = splitSelfRelationCustomFields(fields, ProductVariant, 'customFields.')
    expect(split).toEqual({ relations: ['customFields.brand'], selfRelationNames: ['baseVariant'] })
  })

  it('applies the prefix to kept relations only', () => {
    const split = splitSelfRelationCustomFields(fields, ProductVariant, 'variants.customFields.')
    expect(split).toEqual({
      relations: ['variants.customFields.brand'],
      selfRelationNames: ['baseVariant'],
    })
  })

  it('treats a relation to a different owner entity as a normal relation', () => {
    const split = splitSelfRelationCustomFields(fields, Product, 'customFields.')
    expect(split).toEqual({
      relations: ['customFields.brand', 'customFields.baseVariant'],
      selfRelationNames: [],
    })
  })

  it('returns empty lists when there are no relation fields', () => {
    const split = splitSelfRelationCustomFields(
      [{ name: 'note', type: 'string' }] as CustomFieldConfig[],
      Product,
      'customFields.',
    )
    expect(split).toEqual({ relations: [], selfRelationNames: [] })
  })
})
