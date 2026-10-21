import { Asset, CustomFieldConfig, RelationCustomFieldConfig } from '@vendure/core'
import { getGraphQlInputName } from '@vendure/common/lib/shared-utils'
import { cloneDeep } from 'lodash'
import { ParsedProductWithVariants } from '../providers/import-providers/import-parser'
import { ImportRowGroup } from '../strategies/import-row-validation-strategy'
import {
  RelationLookup,
  RelationLookupResult,
  relationLookupKey,
  splitLookupList,
} from './relation-lookup-resolver'

type Owner = 'product' | 'variant'

interface RowGroupContext {
  lookups: Pick<RelationLookupResult, 'fields' | 'idsByLookup'>
  customFields: { Product: CustomFieldConfig[]; ProductVariant: CustomFieldConfig[] }
}

/**
 * The parsed products as the row validation strategy gets them: deep copies, with relation custom
 * fields under their input names and lookup values swapped for ids. The parsed rows are not changed.
 */
export function toImportRowGroups(
  results: ParsedProductWithVariants[],
  lookups: RowGroupContext['lookups'],
  customFields: RowGroupContext['customFields'],
): ImportRowGroup[] {
  const context = { lookups, customFields }
  return results.map(({ product, variants }) => {
    const productCopy = withInputCustomFields(cloneDeep(product), 'product', context)
    return {
      line: product.line ?? 0,
      product: productCopy,
      variants: variants.map((variant) => ({
        line: variant.line ?? 0,
        variant: withInputCustomFields(cloneDeep(variant), 'variant', context),
      })),
    }
  })
}

function withInputCustomFields<
  T extends { translations: Array<{ customFields: Record<string, unknown> }> },
>(
  entity: T,
  owner: Owner,
  context: RowGroupContext,
): Omit<T, 'translations'> & {
  translations: T['translations']
  customFields: Record<string, unknown>
} {
  const translations = entity.translations.map((translation) => ({
    ...translation,
    customFields: toInputCustomFields(translation.customFields, owner, context),
  }))
  return { ...entity, translations, customFields: { ...(translations[0]?.customFields ?? {}) } }
}

function toInputCustomFields(
  raw: Record<string, unknown>,
  owner: Owner,
  { lookups, customFields }: RowGroupContext,
): Record<string, unknown> {
  const configs = owner === 'product' ? customFields.Product : customFields.ProductVariant
  const out: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(raw)) {
    const config = configs.find((candidate) => candidate.name === name)
    if (config?.type !== 'relation' || (config as RelationCustomFieldConfig).entity === Asset) {
      out[name] = value
      continue
    }
    const ids = relationIds(
      value,
      config.list === true,
      lookups.fields.get(`${owner}:${name}`),
      lookups.idsByLookup,
    )
    if (config.list === true) {
      if (ids.length > 0) {
        out[getGraphQlInputName(config)] = ids
      }
    } else if (ids[0] !== undefined) {
      out[getGraphQlInputName(config)] = ids[0]
    }
  }
  return out
}

/** The ids a relation cell names, as strings; values a lookup could not resolve are left out. */
function relationIds(
  value: unknown,
  list: boolean,
  lookup: RelationLookup | undefined,
  idsByLookup: RelationLookupResult['idsByLookup'],
): string[] {
  if (value !== null && typeof value === 'object' && 'id' in value) {
    return [String((value as { id: unknown }).id)]
  }
  const text = typeof value === 'string' ? value.trim() : ''
  const values = list ? splitLookupList(text) : text === '' ? [] : [text]
  if (!lookup) {
    return values
  }
  return values.flatMap((item) => {
    const id = idsByLookup.get(relationLookupKey(lookup, item))
    return id === undefined ? [] : [String(id)]
  })
}
