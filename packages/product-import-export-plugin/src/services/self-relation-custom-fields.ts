import { CustomFieldConfig, ID, Product, ProductVariant } from '@vendure/core'
import { Repository } from 'typeorm'

export interface SelfRelationSplit {
  /** Relation paths safe for findAll / repository relations, e.g. 'customFields.brand'. */
  relations: string[]
  /** Names of relation custom fields whose entity is the owner entity itself. */
  selfRelationNames: string[]
}

/**
 * Splits an entity's relation custom fields into paths that can be loaded through
 * `ProductService.findAll` / repository `relations`, and self-referencing fields (a Product field
 * relating to Product, a ProductVariant field relating to ProductVariant). TypeORM joins a
 * self-referencing relation under the owner table's own alias a second time, which Postgres rejects
 * ("table name specified more than once"), so those must be loaded with
 * {@link loadSelfRelationCustomFieldIds} instead.
 */
export function splitSelfRelationCustomFields(
  fields: CustomFieldConfig[],
  owner: typeof Product | typeof ProductVariant,
  prefix: string,
): SelfRelationSplit {
  const relationFields = fields.filter((field) => field.type === 'relation')
  return {
    relations: relationFields
      .filter((field) => field.entity !== owner)
      .map((field) => `${prefix}${field.name}`),
    selfRelationNames: relationFields
      .filter((field) => field.entity === owner)
      .map((field) => field.name),
  }
}

/**
 * Loads the related ids of self-referencing relation custom fields with an explicit join alias,
 * one query per field. Returns a map keyed by the stringified owner id; each entry holds every
 * requested field: `ID | null` for a single relation, `ID[]` (possibly empty) for a list.
 */
export async function loadSelfRelationCustomFieldIds(
  repository: Repository<Product> | Repository<ProductVariant>,
  alias: string,
  ids: ID[],
  fields: Array<{ name: string; list: boolean }>,
): Promise<Map<string, Record<string, ID | ID[] | null>>> {
  const byOwnerId = new Map<string, Record<string, ID | ID[] | null>>()
  if (ids.length === 0 || fields.length === 0) {
    return byOwnerId
  }
  for (const id of ids) {
    byOwnerId.set(
      String(id),
      Object.fromEntries(fields.map((field) => [field.name, field.list ? [] : null])),
    )
  }
  for (const field of fields) {
    const rows = await (repository as Repository<Product | ProductVariant>)
      .createQueryBuilder(alias)
      .select(`${alias}.id`, 'ownerId')
      .addSelect('related.id', 'relatedId')
      .innerJoin(`${alias}.customFields.${field.name}`, 'related')
      .where(`${alias}.id IN (:...ids)`, { ids })
      .orderBy('related.id', 'ASC')
      .getRawMany<{ ownerId: ID; relatedId: ID }>()
    for (const row of rows) {
      const entry = byOwnerId.get(String(row.ownerId))
      if (!entry) {
        continue
      }
      const current = entry[field.name]
      entry[field.name] = Array.isArray(current) ? [...current, row.relatedId] : row.relatedId
    }
  }
  return byOwnerId
}
