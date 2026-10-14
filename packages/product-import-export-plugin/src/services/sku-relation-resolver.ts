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

/** The fourth header segment that makes a relation column hold SKUs instead of ids. */
export const SKU_LOOKUP = 'sku'

/** SKUs per database query, well below every driver's bind parameter limit. */
const SKU_QUERY_CHUNK_SIZE = 1000

export interface SkuRelationResult {
  /** One line per problem, ready to show to the person who uploaded the file. */
  errors: string[]
  /** The id of the single live variant behind each SKU the file references. */
  variantIdsBySku: Map<string, ID>
}

interface SkuColumn {
  header: string
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
    let headers: string[]
    try {
      headers = this.readHeaders(csv)
    } catch {
      // Not ours to report: without readable headers there are no SKU columns, and the
      // importer's own parser tells the uploader what is wrong with the file.
      return { errors: [], variantIdsBySku }
    }
    const lookupHeaders = headers.filter((header) => this.splitHeader(header).length === 4)
    if (lookupHeaders.length === 0) {
      return { errors: [], variantIdsBySku }
    }

    const headerErrors = lookupHeaders.flatMap((header) => this.checkHeader(header))
    if (headerErrors.length > 0) {
      return { errors: headerErrors, variantIdsBySku }
    }

    const columns: SkuColumn[] = lookupHeaders.map((header) => ({
      header,
      list: this.findFieldConfig(header)?.list === true,
    }))

    let rows: Array<{ line: number; skus: string[] }>
    try {
      rows = this.readSkus(csv, columns)
    } catch (error) {
      return { errors: [`Could not read the file: ${(error as Error).message}`], variantIdsBySku }
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
    return { errors, variantIdsBySku }
  }

  private readHeaders(csv: string): string[] {
    const [headers] = parse(csv, { bom: true, to_line: 1, relax_column_count: true }) as string[][]
    return (headers ?? []).map((header) => header.trim())
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

  /** The SKUs each data row references, with the file line the row ends on (header is line 1). */
  private readSkus(csv: string, columns: SkuColumn[]): Array<{ line: number; skus: string[] }> {
    const records = parse(csv, {
      bom: true,
      columns: (headers: string[]) => headers.map((header) => header.trim()),
      skip_empty_lines: true,
      // As lenient as the importer's parser, so a file it imports is never rejected here.
      relax_column_count: true,
      relax_quotes: true,
      info: true,
    }) as Array<{ record: Record<string, string>; info: { lines: number } }>

    return records
      .map(({ record, info }) => ({
        line: info.lines,
        skus: columns.flatMap(({ header, list }) => splitSkus(record[header], list)),
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

function splitSkus(value: string | undefined, list: boolean): string[] {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '') {
    return []
  }
  if (!list) {
    return [trimmed]
  }
  return trimmed
    .split('|')
    .map((sku) => sku.trim())
    .filter((sku) => sku !== '')
}

function uniqueSkus(rows: Array<{ skus: string[] }>): string[] {
  return [...new Set(rows.flatMap((row) => row.skus))]
}
