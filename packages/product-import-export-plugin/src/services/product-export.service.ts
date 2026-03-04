import { Injectable, Inject } from '@nestjs/common'
import {
  EntityHydrator,
  ID,
  ProductService,
  RequestContext,
  StockLevelService,
  ChannelService,
  Asset,
  ConfigService,
  Product,
  LanguageCode,
} from '@vendure/core'
import { PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS } from '../constants'
import { PluginInitOptions } from '../types'
import { createObjectCsvWriter } from 'csv-writer'
import * as path from 'path'
import { existsSync, mkdirSync, promises as fs } from 'fs'
import { forEach, sortBy, startsWith } from 'lodash'
import Bottleneck from 'bottleneck'
import { CsvWriter } from 'csv-writer/src/lib/csv-writer'

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
    const exportsDir = path.join(process.cwd(), 'static', 'exports', channelToken)
    if (!existsSync(exportsDir)) {
      mkdirSync(exportsDir, { recursive: true })
    }

    // Add timestamp to filename to avoid conflicts
    const timestamp = formatTimestampForFilename()
    const { name, ext } = path.parse(fileName)
    const timestampedFileName = `${name}_${timestamp}${ext}`
    const finalExportFile = path.join(exportsDir, timestampedFileName)
    // Use .tmp extension during export, rename to final name when complete to prevent it from being listed in ui without being completed
    const exportFile = `${finalExportFile}.tmp`

    const headers: { id: string; title: string }[] = []

    headers.push({ id: 'productId', title: 'productId' })
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
            ),
          ),
        )

        await Promise.all(exportPromises)

        currentPage++
      }

      // Rename .tmp file to final name when export is complete
      await fs.rename(exportFile, finalExportFile)

      return finalExportFile
    } catch (error) {
      // Clean up .tmp file if export fails
      try {
        if (existsSync(exportFile)) {
          await fs.unlink(exportFile)
        }
      } catch (cleanupErr) {
        console.error('Failed to clean up temp file:', cleanupErr)
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

    for (const variant of activeVariants) {
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

      const stockOnHand = await this.getStockOnHand(ctx, variant.id) // Adjusted to fetch stock details

      const variantTranslations = variant.translations
      const variantNameTranslations = this.mapTranslations(variantTranslations, 'name', languages)

      const record: any = {}

      const convertToHTML = (text: string) => {
        return text
          .replace(/\n/g, '<br>')
          .replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;')
          .replace(/,\s*'/g, ", '")
      }

      for (const lang of languages) {
        const escapedDescription = convertToHTML(descriptionTranslations[lang])
        const escapedName = nameTranslations[lang]
          .replace(/"/g, "'")
          .replace(/\s+/g, ' ')
          .replace(/,\s*'/g, ", '")
          .replace(/'/g, "''")
        record.productId = records.length === 0 ? product.id : ''
        record[`name:${lang}`] = records.length === 0 ? escapedName || '' : ''
        record[`slug:${lang}`] = records.length === 0 ? slugTranslations[lang] || '' : ''
        record[`description:${lang}`] = records.length === 0 ? escapedDescription || '' : ''
        record[`facets:${lang}`] = records.length === 0 ? productFacets[lang] : ''
        record[`optionGroups:${lang}`] = records.length === 0 ? optionGroupNames[lang] : ''
        record[`optionValues:${lang}`] = variantValues[lang]
        record[`variantFacets:${lang}`] = variantFacets[lang]
      }

      const productVariantPrices = variant.productVariantPrices.filter(
        (price) => price.channelId === ctx.channelId,
      )
      record.assets = records.length === 0 ? productAssets : ''
      record.sku = variant.sku
      record.price = productVariantPrices[0]?.price / 100 // Assuming the price is stored in cents
      record.taxCategory = 'standard' // Replace with actual tax category if available
      record.stockOnHand = stockOnHand
      record.trackInventory = variant.trackInventory.toLowerCase()
      record.variantAssets = variantAssets
      record.enabled = variant.enabled.toString()

      for (const field of filteredCustomFieldNames) {
        const [entity, fieldName, type] = field.split(':') as [
          'product' | 'variant',
          string,
          string,
        ]
        if (entity === 'product') {
          record[field] =
            this.handleCustomFields(customFields, fieldName, type, exportAssetsAs) || ''
        } else if (entity === 'variant') {
          record[field] =
            this.handleCustomFields(variant.customFields, fieldName, type, exportAssetsAs) || ''
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

  private handleCustomFields(
    customFields: Record<string, any>,
    fieldName: string,
    type: string,
    exportAssetsAs: 'url' | 'json',
  ) {
    const fieldValue = customFields[fieldName]
    if (!fieldValue) {
      return
    }

    const relationsTypes = [
      ...this.configService.customFields.Product.map((field) => {
        if (field.type === 'relation') return field.entity.name.toLowerCase()
      }),
      ...this.configService.customFields.ProductVariant.map((field) => {
        if (field.type === 'relation') return field.entity.name.toLowerCase()
      }),
    ].filter((type) => type)

    if (relationsTypes.includes(type)) {
      if (type === 'asset') {
        return (customFields[fieldName] = this.handleAssets([fieldValue], exportAssetsAs))
      } else {
        return (customFields[fieldName] = fieldValue.id)
      }

      return
    }

    if (typeof fieldValue === 'object') {
      customFields[fieldName] = customFields[fieldName] = JSON.stringify(fieldValue)
        .replace(/"/g, "'") // Replace double quotes with single quotes
        .replace(/\s+/g, ' ') // Remove unnecessary whitespace and line breaks
        .replace(/,\s*'/g, ", '") // Ensure clean spacing after commas
    } else if (startsWith(fieldValue, '{') || startsWith(fieldValue, '[')) {
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

  async getCustomFields(ctx: RequestContext, productIds: string[]) {
    const customFields = new Set<{ name: string; type: string }>()

    forEach(this.configService.customFields.Product, (field) => {
      if (field.type === 'relation') {
        const entity = field.entity.name

        customFields.add({
          name: `product:${field.name}`,
          type: entity.toLowerCase(),
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
        const entity = field.entity.name

        customFields.add({
          name: `variant:${field.name}`,
          type: entity.toLowerCase(),
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
