import { Injectable } from '@nestjs/common'
import {
  ConfigService,
  CustomFieldConfig,
  ID,
  ProductVariant,
  RelationCustomFieldConfig,
  RequestContext,
  TransactionalConnection,
} from '@vendure/core'
import { parse } from 'csv-parse/sync'
import { In, IsNull } from 'typeorm'
import { importCsvHeaders, importCsvLines } from '../helpers/import-csv-lines'

/** The fourth header segment that makes a relation column hold SKUs instead of ids. */
export const SKU_LOOKUP = 'sku'

/** SKUs per database query, well below every driver's bind parameter limit. */
const SKU_QUERY_CHUNK_SIZE = 1000

export interface SkuRelationResult {
  /** One line per problem, ready to show to the person who uploaded the file. */
  errors: string[]
  /** The id of the single live variant behind each SKU the file references. */
  variantIdsBySku: Map<string, ID>
  /** `<owner>:<field>` keys of the relation columns whose values are SKUs. */
  fields: Set<string>
}

interface SkuColumn {
  index: number
  list: boolean
}

/**
 * Resolves relation custom field columns written as `<owner>:<field>:<type>:sku`, where each
 * value names the related ProductVariant by SKU. Every SKU must match exactly one variant that is
 * not deleted, in any channel: base variants usually live outside the channel being imported into.
 */
@Injectable()
export class SkuRelationResolver {
  constructor(
    private connection: TransactionalConnection,
    private configService: ConfigService,
  ) {}

  async resolve(ctx: RequestContext, csv: string): Promise<SkuRelationResult> {
    const variantIdsBySku = new Map<string, ID>()
    const fields = new Set<string>()
    // The importer reads the same lines and headers, so both agree on which columns hold SKUs
    // and on row numbers.
    const lines = importCsvLines(csv)
    const headers = importCsvHeaders(lines)
    const lookupHeaders = headers.filter((header) => this.splitHeader(header).length === 4)
    if (lookupHeaders.length === 0) {
      return { errors: [], variantIdsBySku, fields }
    }

    const headerErrors = lookupHeaders.flatMap((header) => this.checkHeader(header))
    if (headerErrors.length > 0) {
      return { errors: headerErrors, variantIdsBySku, fields }
    }

    const columns: SkuColumn[] = lookupHeaders.map((header) => {
      const [owner, fieldName] = this.splitHeader(header)
      fields.add(`${owner}:${fieldName}`)
      return { index: headers.indexOf(header), list: this.findFieldConfig(header)?.list === true }
    })

    let rows: Array<{ line: number; skus: string[] }>
    try {
      rows = this.readSkus(lines, columns)
    } catch (error) {
      return {
        errors: [`Could not read the file: ${(error as Error).message}`],
        variantIdsBySku,
        fields,
      }
    }

    const matches = await this.findLiveVariants(ctx, uniqueSkus(rows))
    const errors: string[] = []
    for (const { line, skus } of rows) {
      for (const sku of skus) {
        const found = matches.get(sku) ?? []
        if (found.length === 0) {
          errors.push(`Row ${line}: no variant with SKU ${sku}`)
        } else if (found.length > 1) {
          errors.push(`Row ${line}: SKU ${sku} matches ${found.length} variants`)
        } else {
          variantIdsBySku.set(sku, found[0])
        }
      }
    }
    return { errors, variantIdsBySku, fields }
  }

  private splitHeader(header: string): string[] {
    if (!header.startsWith('product:') && !header.startsWith('variant:')) {
      return []
    }
    return header.split(':')
  }

  private checkHeader(header: string): string[] {
    const lookup = this.splitHeader(header)[3]
    if (lookup !== SKU_LOOKUP) {
      return [`Column '${header}': only ':${SKU_LOOKUP}' is supported as a lookup`]
    }
    const config = this.findFieldConfig(header)
    if (!config) {
      const [owner, fieldName] = this.splitHeader(header)
      const entity = owner === 'product' ? 'Product' : 'ProductVariant'
      return [`Column '${header}': ${entity} has no custom field named '${fieldName}'`]
    }
    const isVariantRelation =
      config?.type === 'relation' && (config as RelationCustomFieldConfig).entity === ProductVariant
    if (!isVariantRelation) {
      return [
        `Column '${header}': ':${SKU_LOOKUP}' works only on relation custom fields to ProductVariant`,
      ]
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
   * The SKUs each data row references, with the row's line as the importer numbers it: the
   * header is line 1 and blank and comma-only lines are not counted.
   */
  private readSkus(lines: string[], columns: SkuColumn[]): Array<{ line: number; skus: string[] }> {
    const [, ...records] = parse(lines.join('\n'), {
      bom: true,
      // As lenient as the importer's parser, so a file it imports is never rejected here.
      relax_column_count: true,
      relax_quotes: true,
    }) as string[][]

    return records
      .map((record, index) => ({
        line: index + 2,
        skus: columns.flatMap(({ index: column, list }) => splitSkus(record[column], list)),
      }))
      .filter((row) => row.skus.length > 0)
  }

  private async findLiveVariants(ctx: RequestContext, skus: string[]): Promise<Map<string, ID[]>> {
    const matches = new Map<string, ID[]>()
    if (skus.length === 0) {
      return matches
    }
    const repository = this.connection.getRepository(ctx, ProductVariant)
    const variants: ProductVariant[] = []
    for (let start = 0; start < skus.length; start += SKU_QUERY_CHUNK_SIZE) {
      const chunk = skus.slice(start, start + SKU_QUERY_CHUNK_SIZE)
      variants.push(
        ...(await repository.find({
          select: ['id', 'sku'],
          where: { sku: In(chunk), deletedAt: IsNull() },
        })),
      )
    }
    for (const variant of variants) {
      matches.set(variant.sku, [...(matches.get(variant.sku) ?? []), variant.id])
    }
    return matches
  }
}

/** The SKUs in a list relation cell, written `SKU|SKU`. */
export function splitSkuList(value: string): string[] {
  return value
    .split('|')
    .map((sku) => sku.trim())
    .filter((sku) => sku !== '')
}

function splitSkus(value: string | undefined, list: boolean): string[] {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') {
    return []
  }
  return list ? splitSkuList(trimmed) : [trimmed]
}

function uniqueSkus(rows: Array<{ skus: string[] }>): string[] {
  return [...new Set(rows.flatMap((row) => row.skus))]
}
