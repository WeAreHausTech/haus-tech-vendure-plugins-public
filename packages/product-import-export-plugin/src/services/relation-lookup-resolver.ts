import { Injectable } from '@nestjs/common'
import {
  ConfigService,
  CustomFieldConfig,
  ID,
  ProductVariant,
  RelationCustomFieldConfig,
  RequestContext,
  TransactionalConnection,
  Type,
  VendureEntity,
} from '@vendure/core'
import { parse } from 'csv-parse/sync'
import { FindOptionsWhere, In, IsNull } from 'typeorm'
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata'
import { importCsvHeaders, importCsvLines } from '../helpers/import-csv-lines'

/** The fourth header segment that makes a ProductVariant relation column hold SKUs. */
export const SKU_LOOKUP = 'sku'

/** Values per database query, well below every driver's bind parameter limit. */
const LOOKUP_QUERY_CHUNK_SIZE = 1000

/** Column types a lookup can match a CSV cell against without a cast. */
const TEXT_COLUMN_TYPES = new Set([
  'varchar',
  'character varying',
  'nvarchar',
  'text',
  'char',
  'character',
  'nchar',
  'citext',
])

/** The column a relation custom field's values are matched on, instead of the id. */
export interface RelationLookup {
  /** Class name of the related entity, e.g. `ProductVariant`. */
  entityName: string
  /** Property name of the column the values are matched on, e.g. `sku`. */
  column: string
}

export interface RelationLookupResult {
  /** One line per problem, ready to show to the person who uploaded the file. */
  errors: string[]
  /**
   * False when a lookup header is wrong or the file cannot be read, so no row was checked and
   * `fields` may be incomplete. The errors are then about the file, not about rows.
   */
  rowsChecked: boolean
  /** The id of the single live row behind each value, keyed by `relationLookupKey`. */
  idsByLookup: Map<string, ID>
  /** The lookup of each `<owner>:<field>` relation column whose values are not ids. */
  fields: Map<string, RelationLookup>
}

/** The key of one looked-up value in `RelationLookupResult.idsByLookup`. */
export function relationLookupKey(lookup: RelationLookup, value: string): string {
  return `${lookup.entityName}:${lookup.column}:${value}`
}

interface LookupColumn {
  index: number
  list: boolean
  lookup: RelationLookup
  entity: Type<VendureEntity>
}

interface LookupRow {
  line: number
  values: Array<{ column: LookupColumn; value: string }>
}

/**
 * Resolves relation custom field columns written as `<owner>:<field>:<entity>:<column>`, where
 * each value names the related row by that column instead of by id (`:sku` on a ProductVariant
 * relation names the variant by SKU). Every value must match exactly one row that is not
 * soft-deleted, in any channel: related rows usually live outside the channel being imported into.
 */
@Injectable()
export class RelationLookupResolver {
  constructor(
    private connection: TransactionalConnection,
    private configService: ConfigService,
  ) {}

  async resolve(ctx: RequestContext, csv: string): Promise<RelationLookupResult> {
    const idsByLookup = new Map<string, ID>()
    const fields = new Map<string, RelationLookup>()
    // The importer reads the same lines and headers, so both agree on which columns hold lookups
    // and on row numbers.
    const lines = importCsvLines(csv)
    const headers = importCsvHeaders(lines)
    const lookupHeaders = headers.filter((header) => this.splitHeader(header).length === 4)
    if (lookupHeaders.length === 0) {
      return { errors: [], rowsChecked: true, idsByLookup, fields }
    }

    const headerErrors = [
      ...lookupHeaders.flatMap((header) => this.checkHeader(header)),
      ...duplicateFieldErrors(lookupHeaders.map((header) => this.splitHeader(header))),
    ]
    if (headerErrors.length > 0) {
      return { errors: headerErrors, rowsChecked: false, idsByLookup, fields }
    }

    const columns: LookupColumn[] = lookupHeaders.map((header) => {
      const [owner, fieldName, , column] = this.splitHeader(header)
      const config = this.findFieldConfig(header) as RelationCustomFieldConfig
      const lookup = { entityName: config.entity.name, column }
      fields.set(`${owner}:${fieldName}`, lookup)
      return {
        index: headers.indexOf(header),
        list: config.list === true,
        lookup,
        entity: config.entity,
      }
    })

    let rows: LookupRow[]
    try {
      rows = this.readValues(lines, columns)
    } catch (error) {
      return {
        errors: [`Could not read the file: ${(error as Error).message}`],
        rowsChecked: false,
        idsByLookup,
        fields,
      }
    }

    const matches = await this.findLiveRows(ctx, rows)
    const errors: string[] = []
    for (const { line, values } of rows) {
      for (const { column, value } of values) {
        const key = relationLookupKey(column.lookup, value)
        const found = matches.get(key) ?? []
        if (found.length === 1) {
          idsByLookup.set(key, found[0])
        } else {
          errors.push(`Row ${line}: ${lookupError(column.lookup, value, found.length)}`)
        }
      }
    }
    return { errors, rowsChecked: true, idsByLookup, fields }
  }

  private splitHeader(header: string): string[] {
    if (!header.startsWith('product:') && !header.startsWith('variant:')) {
      return []
    }
    return header.split(':')
  }

  private checkHeader(header: string): string[] {
    const [owner, fieldName, entitySegment, column] = this.splitHeader(header)
    const config = this.findFieldConfig(header)
    if (!config) {
      const entity = owner === 'product' ? 'Product' : 'ProductVariant'
      return [`Column '${header}': ${entity} has no custom field named '${fieldName}'`]
    }
    if (config.type !== 'relation') {
      return [`Column '${header}': a lookup works only on relation custom fields`]
    }
    const { entity } = config as RelationCustomFieldConfig
    const expectedSegment = entity.name.toLowerCase()
    // `:sku` on a ProductVariant relation never read the third segment, so files written with any
    // segment there keep importing.
    const isLegacySku = entity === ProductVariant && column === SKU_LOOKUP
    if (!isLegacySku && entitySegment.toLowerCase() !== expectedSegment) {
      return [
        `Column '${header}': the third segment must be '${expectedSegment}', the related entity`,
      ]
    }
    if (!this.findLookupColumn(entity, column)) {
      return [`Invalid lookup column "${column}" on ${entity.name}`]
    }
    return []
  }

  private findFieldConfig(header: string): CustomFieldConfig | undefined {
    const [owner, fieldName] = this.splitHeader(header)
    const configs =
      owner === 'product'
        ? this.configService.customFields.Product
        : this.configService.customFields.ProductVariant
    return configs.find((config) => config.name === fieldName)
  }

  /**
   * A plain text column of the entity, so a CSV cell compares to it without a cast. Relation and
   * embedded columns (custom fields among them) are not lookups.
   */
  private findLookupColumn(
    entity: Type<VendureEntity>,
    propertyName: string,
  ): ColumnMetadata | undefined {
    // Not findColumnWithPropertyName: it can return a custom field (embedded) column of that name.
    const column = this.connection.rawConnection
      .getMetadata(entity)
      .columns.find(
        (candidate) =>
          candidate.propertyName === propertyName &&
          !candidate.embeddedMetadata &&
          !candidate.relationMetadata,
      )
    if (!column) {
      return undefined
    }
    const isText = column.type === String || TEXT_COLUMN_TYPES.has(String(column.type))
    return isText ? column : undefined
  }

  /**
   * The lookup values each data row references, with the row's line as the importer numbers it:
   * the header is line 1 and blank and comma-only lines are not counted.
   */
  private readValues(lines: string[], columns: LookupColumn[]): LookupRow[] {
    const [, ...records] = parse(lines.join('\n'), {
      bom: true,
      // As lenient as the importer's parser, so a file it imports is never rejected here.
      relax_column_count: true,
      relax_quotes: true,
    }) as string[][]

    return records
      .map((record, index) => ({
        line: index + 2,
        values: columns.flatMap((column) =>
          splitValues(record[column.index], column.list).map((value) => ({ column, value })),
        ),
      }))
      .filter((row) => row.values.length > 0)
  }

  /** The ids of the live rows behind every value, keyed by `relationLookupKey`. */
  private async findLiveRows(ctx: RequestContext, rows: LookupRow[]): Promise<Map<string, ID[]>> {
    // One query (per chunk) for each entity and column, however many columns use it.
    const valuesByLookup = new Map<string, { column: LookupColumn; values: Set<string> }>()
    for (const { column, value } of rows.flatMap((row) => row.values)) {
      const groupKey = relationLookupKey(column.lookup, '')
      const group = valuesByLookup.get(groupKey) ?? { column, values: new Set<string>() }
      group.values.add(value)
      valuesByLookup.set(groupKey, group)
    }

    const matches = new Map<string, ID[]>()
    for (const { column, values } of valuesByLookup.values()) {
      for (const row of await this.findLiveRowsByColumn(ctx, column, [...values])) {
        const key = relationLookupKey(column.lookup, row.value)
        matches.set(key, [...(matches.get(key) ?? []), row.id])
      }
    }
    return matches
  }

  private async findLiveRowsByColumn(
    ctx: RequestContext,
    { entity, lookup }: LookupColumn,
    values: string[],
  ): Promise<Array<{ id: ID; value: string }>> {
    const softDeletes =
      this.connection.rawConnection.getMetadata(entity).findColumnWithPropertyName('deletedAt') !==
      undefined
    const repository = this.connection.getRepository(ctx, entity)
    const found: Array<{ id: ID; value: string }> = []
    for (let start = 0; start < values.length; start += LOOKUP_QUERY_CHUNK_SIZE) {
      const chunk = values.slice(start, start + LOOKUP_QUERY_CHUNK_SIZE)
      // The column name was checked against the entity's metadata in checkHeader.
      const where = {
        [lookup.column]: In(chunk),
        ...(softDeletes ? { deletedAt: IsNull() } : {}),
      } as FindOptionsWhere<VendureEntity>
      const rows = await repository.find({
        select: ['id', lookup.column] as Array<keyof VendureEntity>,
        where,
      })
      found.push(
        ...rows.map((row) => ({
          id: row.id,
          value: String((row as unknown as Record<string, unknown>)[lookup.column]),
        })),
      )
    }
    return found
  }
}

/** A second lookup column for a field that an earlier column already gives. */
function duplicateFieldErrors(headers: string[][]): string[] {
  const seen = new Set<string>()
  const errors: string[] = []
  for (const parts of headers) {
    const field = `${parts[0]}:${parts[1]}`
    if (seen.has(field)) {
      errors.push(`Column '${parts.join(':')}': ${field} is already given by another column`)
    }
    seen.add(field)
  }
  return errors
}

function lookupError(lookup: RelationLookup, value: string, matchCount: number): string {
  const isSku = lookup.entityName === ProductVariant.name && lookup.column === SKU_LOOKUP
  if (matchCount === 0) {
    return isSku
      ? `no variant with SKU ${value}`
      : `no ${lookup.entityName} with ${lookup.column} ${value}`
  }
  return isSku
    ? `SKU ${value} matches ${matchCount} variants`
    : `${lookup.column} ${value} matches ${matchCount} ${lookup.entityName} rows`
}

/** The values in a list relation cell, written `VALUE|VALUE`. */
export function splitLookupList(value: string): string[] {
  return value
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

/** The SKUs in a list relation cell, written `SKU|SKU`. */
export const splitSkuList = splitLookupList

function splitValues(value: string | undefined, list: boolean): string[] {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') {
    return []
  }
  return list ? splitLookupList(trimmed) : [trimmed]
}
