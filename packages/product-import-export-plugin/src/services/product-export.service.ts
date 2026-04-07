import { Injectable, Inject } from '@nestjs/common'
import {
  Asset,
  ConfigService,
  ID,
  LanguageCode,
  Product,
  ProductService,
  RelationCustomFieldConfig,
  RequestContext,
  StockLevelService,
  ChannelService,
} from '@vendure/core'
import { EXPORT_STORAGE_STRATEGY, PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS } from '../constants'
import { PluginInitOptions } from '../types'
import { createObjectCsvWriter } from 'csv-writer'
import * as path from 'path'
import { existsSync, mkdirSync, promises as fs } from 'fs'
import { forEach, sortBy, startsWith } from 'lodash'
import Bottleneck from 'bottleneck'
import { CsvWriter } from 'csv-writer/src/lib/csv-writer'
import { ExportStorageStrategy } from './export-storage/export-storage-strategy'

interface TranslationMap {
  [key: string]: string
}

export type RelationType =
  | 'string'
  | 'boolean'
  | 'localeString'
  | 'text'
  | 'localeText'
  | 'int'
  | 'float'
  | 'datetime'
  | 'relation'

/**
 * Formats a date as a timestamp string for use in filenames.
 * Format: YYYY-MM-DD_HH-MM-SS (e.g., "2024-01-15_14-30-45")
 * Uses UTC time to match the original toISOString() behavior.
 */
function formatTimestampForFilename(date: Date = new Date()): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}

@Injectable()
export class ProductExportService {
  constructor(
    @Inject(PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS) private options: PluginInitOptions,
    @Inject(EXPORT_STORAGE_STRATEGY) private exportStorageStrategy: ExportStorageStrategy,
    private productService: ProductService,
    private stockLevelService: StockLevelService,
    private channelService: ChannelService,
    private configService: ConfigService,
  ) {}

  async createExportFile(
    ctx: RequestContext,
    selectionIds: ID[],
    fileName: string,
    selectedCustomFields: string,
    exportAssetsAs: 'url' | 'json',
    selectedExportFields: string,
    pageSize = 50,
    concurrency = 5,
  ) {
    const channel = await this.channelService.findOne(ctx, ctx.channelId)

    if (!channel) {
      throw new Error('Channel not found')
    }

    const languages = channel.availableLanguageCodes

    const allCustomFieldNames = await this.getCustomFields(ctx, selectionIds as string[])
    const filteredCustomFieldNames = selectedCustomFields
      .split(',')
      .filter((field) => allCustomFieldNames.some((f) => f.name === field))
      .map((field) => {
        const found = allCustomFieldNames.find((f) => f.name === field)
        return found ? `${found.name}:${found.type}` : ''
      })

    const channelToken = channel.token
    const tempDir = path.join(process.cwd(), 'static', 'exports-tmp', channelToken)
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true })
    }

    // Add timestamp to filename to avoid conflicts
    const timestamp = formatTimestampForFilename()
    const { name, ext } = path.parse(fileName)
    const timestampedFileName = `${name}_${timestamp}${ext}`
    const finalExportFile = path.join(tempDir, timestampedFileName)
    // Use .tmp extension during export, rename to final name when complete to prevent it from being listed in ui without being completed
    const exportFile = `${finalExportFile}.tmp`

    const headers: { id: string; title: string }[] = []

    // Add headers for translations
    for (const lang of languages) {
      headers.push({ id: `name:${lang}`, title: `name:${lang}` })
      headers.push({ id: `slug:${lang}`, title: `slug:${lang}` })
      headers.push({ id: `description:${lang}`, title: `description:${lang}` })
    }

    headers.push(
      { id: 'assets', title: 'assets' },
      ...languages.map((lang) => ({ id: `facets:${lang}`, title: `facets:${lang}` })),
      ...languages.map((lang) => ({ id: `optionGroups:${lang}`, title: `optionGroups:${lang}` })),
      ...languages.map((lang) => ({ id: `optionValues:${lang}`, title: `optionValues:${lang}` })),
      { id: 'sku', title: 'sku' },
      { id: 'price', title: 'price' },
      { id: 'taxCategory', title: 'taxCategory' },
      { id: 'stockOnHand', title: 'stockOnHand' },
      { id: 'trackInventory', title: 'trackInventory' },
      { id: 'variantAssets', title: 'variantAssets' },
      ...languages.map((lang) => ({ id: `variantFacets:${lang}`, title: `variantFacets:${lang}` })),
      ...filteredCustomFieldNames.map((field) => ({
        id: field,
        title: field,
      })),
      { id: 'enabled', title: 'enabled' },
    )

    const selectedExportFieldsArray = selectedExportFields.split(',')
    const selectedExportFieldsSet = new Set(selectedExportFieldsArray)

    const filteredHeaders = headers.filter((header) => {
      // Ensure custom fields are not filtered out
      if (filteredCustomFieldNames.includes(header.id)) {
        return true
      }
      if (header.id.includes(':')) {
        const field = header.id.split(':')[0]
        return selectedExportFieldsSet.has(field)
      }
      return selectedExportFieldsSet.has(header.id)
    })

    try {
      const csvWriter = createObjectCsvWriter({
        path: exportFile,
        header: filteredHeaders,
        append: false,
      })

      const limiter = new Bottleneck({
        maxConcurrent: concurrency,
      })

      let currentPage = 1
      let hasMore = true

      const productRelationCustomFields = this.configService.customFields.Product.filter(
        (f) => f.type === 'relation',
      ).map((f) => `customFields.${f.name}` as const)

      const variantRelationCustomFields = this.configService.customFields.ProductVariant.filter(
        (f) => f.type === 'relation',
      ).map((f) => `variants.customFields.${f.name}` as const)

      while (hasMore) {
        const { items, totalItems } = await this.productService.findAll(
          ctx,
          {
            filter: {
              id: { in: selectionIds as string[] },
            },
            skip: (currentPage - 1) * pageSize,
            take: pageSize,
          },
          [
            'variants',
            'facetValues',
            'facetValues.facet',
            'optionGroups',
            'assets',
            'variants.assets',
            'variants.facetValues',
            'variants.facetValues.facet',
            'variants.options',
            ...productRelationCustomFields,
            ...variantRelationCustomFields,
          ],
        )

        hasMore = currentPage * pageSize < totalItems

        const exportPromises = items.map((product) =>
          limiter.schedule(async () =>
            this.exportProduct(
              ctx,
              product,
              languages,
              filteredCustomFieldNames,
              exportAssetsAs,
              csvWriter,
              selectedExportFieldsSet.has('stockOnHand'),
            ),
          ),
        )

        await Promise.all(exportPromises)

        currentPage++
      }

      // Rename .tmp file to final name when export is complete
      await fs.rename(exportFile, finalExportFile)

      await this.exportStorageStrategy.storeExportFile(ctx, timestampedFileName, finalExportFile)
      try {
        if (existsSync(finalExportFile)) {
          await fs.unlink(finalExportFile)
        }
      } catch (e) {
        // ignore cleanup errors
      }
      return timestampedFileName
    } catch (error) {
      // Clean up any partial files if export or upload fails
      try {
        if (existsSync(exportFile)) {
          await fs.unlink(exportFile)
        }

        if (existsSync(finalExportFile)) {
          await fs.unlink(finalExportFile)
        }
      } catch (cleanupErr) {
        console.error('Failed to clean up export files:', cleanupErr)
      }

      throw error
    }
  }

  async exportProduct(
    ctx: RequestContext,
    product: Product,
    languages: LanguageCode[],
    filteredCustomFieldNames: string[],
    exportAssetsAs: 'url' | 'json',
    csvWriter: CsvWriter<any>,
    includeStockOnHand: boolean,
  ) {
    const records: any[] = []
    const {
      assets = [],
      facetValues = [],
      optionGroups = [],
      variants = [],
      translations = [],
      customFields = {},
    } = product
    const nameTranslations = this.mapTranslations(translations, 'name', languages)
    const slugTranslations = this.mapTranslations(translations, 'slug', languages)
    const descriptionTranslations = this.mapTranslations(translations, 'description', languages)

    // Filter out all variants that are soft deleted
    const activeVariants = variants.filter((v) => !v.deletedAt)
    const stockOnHandByVariantId = includeStockOnHand
      ? await this.getStockOnHandMap(ctx, activeVariants.map((variant) => variant.id))
      : new Map<ID, number>()

    const productAssets =
      assets.length === 0
        ? ''
        : assets.length > 0
          ? this.handleAssets(
              assets.map(({ asset }) => asset),
              exportAssetsAs,
            )
          : this.handleAssets([product.featuredAsset], exportAssetsAs)
    const productFacets = languages.reduce(
      (acc, lang) => {
        acc[lang] = facetValues
          .map((facetValue) => this.mapFacetTranslations(facetValue, lang))
          .filter((facet) => facet)
          .join('|')
        return acc
      },
      {} as { [key: string]: string },
    )

    const optionGroupNames = languages.reduce(
      (acc, lang) => {
        acc[lang] = sortBy(optionGroups, (g) => g.id)
          .map((group) => this.mapTranslations(group.translations, 'name', [lang])[lang])
          .filter((name) => name)
          .join('|')
        return acc
      },
      {} as { [key: string]: string },
    )

    const convertToHTML = (text: string) => {
      return text.replace(/\n/g, '<br>').replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;').replace(/,\s*'/g, ", '")
    }

    const firstRowProductColumnsByLang = languages.reduce(
      (acc, lang) => {
        const escapedDescription = convertToHTML(descriptionTranslations[lang] || '')
        const escapedName = (nameTranslations[lang] || '')
          .replace(/"/g, "'")
          .replace(/\s+/g, ' ')
          .replace(/,\s*'/g, ", '")
          .replace(/'/g, "''")
        acc[lang] = {
          [`name:${lang}`]: escapedName || '',
          [`slug:${lang}`]: slugTranslations[lang] || '',
          [`description:${lang}`]: escapedDescription || '',
          [`facets:${lang}`]: productFacets[lang],
          [`optionGroups:${lang}`]: optionGroupNames[lang],
        }
        return acc
      },
      {} as Record<
        LanguageCode,
        {
          [key: string]: string
        }
      >,
    )

    for (const [variantIndex, variant] of activeVariants.entries()) {
      const variantValues = languages.reduce(
        (acc, lang) => {
          acc[lang] = (sortBy(variant.options, (o) => o.groupId) || [])
            .map((option) => this.mapTranslations(option.translations, 'name', [lang])[lang])
            .filter((name) => name)
            .join('|')
          return acc
        },
        {} as { [key: string]: string },
      )

      const variantAssets = this.handleAssets(
        variant.assets.map(({ asset }) => asset),
        exportAssetsAs,
      )

      const variantFacets = languages.reduce(
        (acc, lang) => {
          acc[lang] = (variant.facetValues || [])
            .map((facet) => this.mapFacetTranslations(facet, lang))
            .filter((facet) => facet)
            .join('|')
          return acc
        },
        {} as { [key: string]: string },
      )

      const stockOnHand = includeStockOnHand ? (stockOnHandByVariantId.get(variant.id) ?? 0) : 0

      const record: any = {}

      for (const lang of languages) {
        const firstRowProductColumns = firstRowProductColumnsByLang[lang]
        record[`name:${lang}`] = variantIndex === 0 ? firstRowProductColumns[`name:${lang}`] : ''
        record[`slug:${lang}`] = variantIndex === 0 ? firstRowProductColumns[`slug:${lang}`] : ''
        record[`description:${lang}`] =
          variantIndex === 0 ? firstRowProductColumns[`description:${lang}`] : ''
        record[`facets:${lang}`] = variantIndex === 0 ? firstRowProductColumns[`facets:${lang}`] : ''
        record[`optionGroups:${lang}`] =
          variantIndex === 0 ? firstRowProductColumns[`optionGroups:${lang}`] : ''
        record[`optionValues:${lang}`] = variantValues[lang]
        record[`variantFacets:${lang}`] = variantFacets[lang]
      }

      const productVariantPrices = variant.productVariantPrices.filter(
        (price) => price.channelId === ctx.channelId,
      )
      record.assets = variantIndex === 0 ? productAssets : ''
      record.sku = variant.sku
      record.price = productVariantPrices[0]?.price / 100 // Assuming the price is stored in cents
      record.taxCategory = 'standard' // Replace with actual tax category if available
      record.stockOnHand = stockOnHand
      record.trackInventory = variant.trackInventory.toLowerCase()
      record.variantAssets = variantAssets
      record.enabled = variant.enabled.toString()

      for (const field of filteredCustomFieldNames) {
        const [owner, fieldName] = field.split(':') as ['product' | 'variant', string, ...string[]]
        if (owner === 'product') {
          record[field] =
            this.handleCustomFields(customFields, fieldName, exportAssetsAs, 'product') ?? ''
        } else if (owner === 'variant') {
          record[field] =
            this.handleCustomFields(variant.customFields, fieldName, exportAssetsAs, 'variant') ??
            ''
        }
      }

      records.push(record)
    }
    await csvWriter.writeRecords(records)
  }

  private handleAssets(assets: Asset[], exportAssetsAs: 'url' | 'json') {
    if (!assets.length) {
      return ''
    }

    if (exportAssetsAs === 'url') {
      return assets.map((asset) => asset.source).join('|')
    }

    return JSON.stringify(
      assets.length > 1
        ? assets.map((asset) => ({
            id: asset.id,
            name: asset.name,
            url: asset.source,
          }))
        : {
            id: assets[0].id,
            name: assets[0].name,
            url: assets[0].source,
          },
    )
      .replace(/"/g, "'") // Replace double quotes with single quotes
      .replace(/\s+/g, ' ') // Remove unnecessary whitespace and line breaks
      .replace(/,\s*'/g, ", '") // Ensure clean spacing after commas
  }

  /**
   * Collects {@link ID}s from any relation custom field value (single entity, list, or raw id),
   * regardless of target entity type (Product, Collection, Channel, etc.).
   */
  private serializeRelationCustomFieldIds(fieldValue: unknown): string[] {
    if (fieldValue == null) {
      return []
    }
    if (Array.isArray(fieldValue)) {
      return fieldValue.map((item) => {
        if (item !== null && typeof item === 'object' && 'id' in item) {
          return String((item as { id: ID }).id)
        }
        return String(item)
      })
    }
    if (typeof fieldValue === 'object' && 'id' in fieldValue) {
      return [String((fieldValue as { id: ID }).id)]
    }
    return [String(fieldValue)]
  }

  private isCustomFieldList(owner: 'product' | 'variant', fieldName: string): boolean {
    const defs =
      owner === 'product'
        ? this.configService.customFields.Product
        : this.configService.customFields.ProductVariant
    const def = defs.find((f) => f.name === fieldName)
    return def?.list === true
  }

  /**
   * Resolves a relation-type custom field on Product or ProductVariant (any related entity).
   */
  private getRelationCustomFieldDef(
    owner: 'product' | 'variant',
    fieldName: string,
  ): RelationCustomFieldConfig | undefined {
    const defs =
      owner === 'product'
        ? this.configService.customFields.Product
        : this.configService.customFields.ProductVariant
    const def = defs.find((f) => f.name === fieldName)
    if (def?.type === 'relation') {
      return def
    }
    return undefined
  }

  private handleCustomFields(
    customFields: Record<string, any>,
    fieldName: string,
    exportAssetsAs: 'url' | 'json',
    owner: 'product' | 'variant',
  ) {
    const fieldValue = customFields[fieldName]
    if (fieldValue == null || fieldValue === '') {
      return
    }

    const relationDef = this.getRelationCustomFieldDef(owner, fieldName)
    if (relationDef) {
      if (relationDef.entity === Asset) {
        const assets = Array.isArray(fieldValue) ? fieldValue : [fieldValue]
        return this.handleAssets(assets, exportAssetsAs)
      }

      const ids = this.serializeRelationCustomFieldIds(fieldValue)
      if (ids.length === 0) {
        return
      }
      const isList = this.isCustomFieldList(owner, fieldName)
      return isList ? ids.join('|') : ids[0]
    }

    if (typeof fieldValue === 'object') {
      customFields[fieldName] = JSON.stringify(fieldValue)
        .replace(/"/g, "'") // Replace double quotes with single quotes
        .replace(/\s+/g, ' ') // Remove unnecessary whitespace and line breaks
        .replace(/,\s*'/g, ", '") // Ensure clean spacing after commas
      return customFields[fieldName]
    }

    if (startsWith(fieldValue, '{') || startsWith(fieldValue, '[')) {
      customFields[fieldName] = fieldValue.replace(/"/g, "'").replace(/\s+/g, ' ')
      return customFields[fieldName]
    }

    return customFields[fieldName]
  }

  // Method to fetch stock on hand for a variant
  private async getStockOnHand(ctx: RequestContext, variantId: ID): Promise<number> {
    const stockLevel = await this.stockLevelService.getAvailableStock(ctx, variantId)
    return stockLevel.stockOnHand
  }

  private async getStockOnHandMap(
    ctx: RequestContext,
    variantIds: ID[],
  ): Promise<Map<ID, number>> {
    const entries: Array<[ID, number]> = await Promise.all(
      variantIds.map(async (variantId): Promise<[ID, number]> => [
        variantId,
        await this.getStockOnHand(ctx, variantId),
      ]),
    )
    return new Map<ID, number>(entries)
  }

  // Method to map translations for a specific field
  private mapTranslations(translations: any[], field: string, languages: string[]): TranslationMap {
    const translationMap: TranslationMap = {}
    for (const lang of languages) {
      const translation = translations.find((t) => t.languageCode === lang)
      translationMap[lang] = translation ? translation[field] : ''
    }

    return translationMap
  }

  // Method to map facet translations
  private mapFacetTranslations(facetValue: any, lang: string): string {
    const facetNameTranslations = this.mapTranslations(facetValue.facet.translations, 'name', [
      lang,
    ])
    const facetValueTranslations = this.mapTranslations(facetValue.translations, 'name', [lang])
    if (!facetNameTranslations[lang] || !facetValueTranslations[lang]) {
      return ''
    }
    return `${facetNameTranslations[lang]}:${facetValueTranslations[lang]}`
  }

  async hasMultiVariantProducts(ctx: RequestContext, selectionIds?: ID[]): Promise<boolean> {
    const pageSize = 100
    let skip = 0
    let hasMore = true

    while (hasMore) {
      const { items, totalItems } = await this.productService.findAll(
        ctx,
        {
          ...(selectionIds && selectionIds.length > 0
            ? {
                filter: {
                  id: { in: selectionIds as string[] },
                },
              }
            : {}),
          skip,
          take: pageSize,
        },
        ['variants'],
      )
      if (items.some((product) => product.variants.filter((variant) => !variant.deletedAt).length > 1)) {
        return true
      }
      skip += pageSize
      hasMore = skip < totalItems
    }

    return false
  }

  async getAllProductIds(ctx: RequestContext): Promise<ID[]> {
    let offset = 0
    const limit = 100
    const productIds: ID[] = []
    let totalItems = 0

    do {
      const { items, totalItems: total } = await this.productService.findAll(ctx, {
        skip: offset,
        take: limit,
      })
      productIds.push(...items.map((product) => product.id))
      totalItems = total
      offset += limit
    } while (productIds.length < totalItems)

    return productIds
  }

  /**
   * Lists exportable custom field columns. For relations, `type` is always the **related entity’s**
   * class name (`field.entity.name.toLowerCase()`) — e.g. `product`, `asset`, `collection` — for any
   * Vendure entity; export logic does not branch on that string, only on the field definition.
   */
  async getCustomFields(ctx: RequestContext, productIds: string[]) {
    const customFields = new Set<{ name: string; type: string }>()

    forEach(this.configService.customFields.Product, (field) => {
      if (field.type === 'relation') {
        const relatedEntityName = field.entity.name

        customFields.add({
          name: `product:${field.name}`,
          type: relatedEntityName.toLowerCase(),
        })

        return
      }

      customFields.add({
        name: `product:${field.name}`,
        type: field.type,
      })
    })

    forEach(this.configService.customFields.ProductVariant, (field) => {
      if (field.type === 'relation') {
        const relatedEntityName = field.entity.name

        customFields.add({
          name: `variant:${field.name}`,
          type: relatedEntityName.toLowerCase(),
        })

        return
      }

      customFields.add({
        name: `variant:${field.name}`,
        type: field.type,
      })
    })

    return Array.from(customFields)
  }

  async getConfig(): Promise<PluginInitOptions> {
    return this.options
  }
}
