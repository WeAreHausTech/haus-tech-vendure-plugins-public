import { describe, expect, it } from 'vitest'
import { Asset, CustomFieldConfig, LanguageCode, ProductVariant } from '@vendure/core'
import { ParsedProductWithVariants } from '../providers/import-providers/import-parser'
import { RelationLookup, relationLookupKey } from './relation-lookup-resolver'
import { toImportRowGroups } from './import-row-groups'

class Label {}

const productFields = [
  { name: 'label', type: 'relation', entity: Label },
  { name: 'labels', type: 'relation', entity: Label, list: true },
  { name: 'image', type: 'relation', entity: Asset },
  { name: 'note', type: 'string' },
] as unknown as CustomFieldConfig[]
const variantFields = [
  { name: 'base', type: 'relation', entity: ProductVariant },
  { name: 'siblings', type: 'relation', entity: ProductVariant, list: true },
] as unknown as CustomFieldConfig[]

const byCode: RelationLookup = { entityName: 'Label', column: 'code' }
const bySku: RelationLookup = { entityName: 'ProductVariant', column: 'sku' }
const lookups = {
  fields: new Map([
    ['product:label', byCode],
    ['product:labels', byCode],
    ['variant:base', bySku],
  ]),
  idsByLookup: new Map<string, string | number>([
    [relationLookupKey(byCode, 'L-1'), 11],
    [relationLookupKey(byCode, 'L-2'), 12],
    [relationLookupKey(bySku, 'BASE-1'), 21],
  ]),
}

function variant(sku: string, line: number, customFields: Record<string, string>) {
  return {
    sku,
    line,
    price: 100,
    assetPaths: [],
    facets: [],
    optionValuesProvided: true,
    translations: [{ languageCode: LanguageCode.en, optionValues: ['S'], customFields }],
  }
}

function parsedProduct(): ParsedProductWithVariants {
  return {
    product: {
      line: 2,
      assetPaths: [],
      optionGroups: [],
      optionGroupsProvided: true,
      facets: [],
      translations: [
        {
          languageCode: LanguageCode.en,
          name: 'Tee',
          slug: 'tee',
          customFields: {
            label: 'L-1',
            labels: 'L-1|NOPE|L-2',
            image: 'https://example.com/a.png',
            note: 'hello',
          },
        },
      ],
    },
    variants: [
      variant('TEE-S', 2, { base: 'BASE-1', siblings: '7|8' }),
      variant('TEE-M', 3, { base: '', siblings: '' }),
      variant('TEE-L', 4, { base: 'NOPE' } as Record<string, string>),
    ],
  }
}

describe('toImportRowGroups', () => {
  const configs = { Product: productFields, ProductVariant: variantFields }

  it('keys relation fields by input name with resolved id strings', () => {
    const [group] = toImportRowGroups([parsedProduct()], lookups, configs)

    expect(group.line).toBe(2)
    expect(group.product.customFields).toEqual({
      labelId: '11',
      labelsIds: ['11', '12'],
      image: 'https://example.com/a.png',
      note: 'hello',
    })
    expect(group.variants.map((v) => v.line)).toEqual([2, 3, 4])
    expect(group.variants[0].variant.sku).toBe('TEE-S')
    expect(group.variants[0].variant.customFields).toEqual({
      baseId: '21',
      siblingsIds: ['7', '8'],
    })
  })

  it('leaves out empty cells and values that did not resolve', () => {
    const [group] = toImportRowGroups([parsedProduct()], lookups, configs)

    expect(group.variants[1].variant.customFields).toEqual({})
    expect(group.variants[2].variant.customFields).toEqual({})
  })

  it('reads a relation given as a JSON object with an id', () => {
    const parsed = parsedProduct()
    const customFields = parsed.product.translations[0].customFields as Record<string, unknown>
    customFields.label = { id: 5 }
    const noLookups = { fields: new Map(), idsByLookup: new Map() }

    const [group] = toImportRowGroups([parsed], noLookups, configs)

    expect(group.product.customFields.labelId).toBe('5')
  })

  it('converts the custom fields of every translation the same way', () => {
    const [group] = toImportRowGroups([parsedProduct()], lookups, configs)

    expect(group.product.translations).toEqual([
      expect.objectContaining({
        name: 'Tee',
        customFields: expect.objectContaining({ labelId: '11' }),
      }),
    ])
  })

  it('hands out copies, so a change to a group never reaches the parsed rows', () => {
    const parsed = parsedProduct()
    const before = JSON.parse(JSON.stringify(parsed))

    const [group] = toImportRowGroups([parsed], lookups, configs)
    group.product.customFields.labelId = '999'
    ;(group.product.translations[0] as { name: string }).name = 'Changed'
    ;(group.product.assetPaths as string[]).push('x')
    group.variants[0].variant.sku = 'CHANGED'
    group.variants.pop()

    expect(parsed).toEqual(before)
  })
})
