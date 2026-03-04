/* eslint-disable no-prototype-builtins */
import { Injectable } from '@nestjs/common'
import { GlobalFlag, LanguageCode } from '@vendure/common/lib/generated-types'
import { unique } from '@vendure/common/lib/unique'
import {
  Channel,
  ConfigService,
  CustomFieldConfig,
  InternalServerError,
  RequestContext,
  SlugStrategy,
} from '@vendure/core'
import { parse, Options } from 'csv-parse'
import { Stream } from 'stream'
import { startsWith } from 'lodash'

const baseTranslatableColumns = [
  'name',
  'slug',
  'description',
  'facets',
  'optionGroups',
  'optionValues',
  'variantFacets',
]

const requiredColumns: string[] = [
  'name',
  // 'slug',
  // 'description',
  // 'assets',
  // 'facets',
  // 'optionGroups',
  // 'optionValues',
  'sku',
  // 'price',
  // 'taxCategory',
  // 'variantAssets',
  // 'variantFacets',
]

/**
 * @description
 * The intermediate representation of an OptionGroup after it has been parsed
 * by the {@link ImportParser}.
 *
 * @docsCategory import-export
 * @docsPage ImportParser
 */
export interface ParsedOptionGroup {
  translations: Array<{
    languageCode: LanguageCode
    name: string
    values: string[]
  }>
}

/**
 * @description
 * The intermediate representation of a Facet after it has been parsed
 * by the {@link ImportParser}.
 *
 * @docsCategory import-export
 * @docsPage ImportParser
 */
export interface ParsedFacet {
  translations: Array<{
    languageCode: LanguageCode
    facet: string
    value: string
  }>
}

export interface ParsedAsset {
  id?: string
  url: string
  name?: string
}

/**
 * @description
 * The intermediate representation of a ProductVariant after it has been parsed
 * by the {@link ImportParser}.
 *
 * @docsCategory import-export
 * @docsPage ImportParser
 */
export interface ParsedProductVariant {
  sku: string
  price: number | undefined
  taxCategory: string
  stockOnHand: number
  trackInventory: GlobalFlag
  assetPaths: string[]
  assetsJson?: ParsedAsset[]
  facets: ParsedFacet[]
  enabled: boolean
  translations: Array<{
    languageCode: LanguageCode
    optionValues: string[]
    customFields: {
      [name: string]: string
    }
  }>
}

/**
 * @description
 * The intermediate representation of a Product after it has been parsed
 * by the {@link ImportParser}.
 *
 * @docsCategory import-export
 * @docsPage ImportParser
 */
export interface ParsedProduct {
  assetPaths: string[]
  assetsJson?: ParsedAsset[]
  optionGroups: ParsedOptionGroup[]
  facets: ParsedFacet[]
  translations: Array<{
    languageCode: LanguageCode
    name: string
    slug: string
    description: string
    customFields: {
      [name: string]: string
    }
  }>
}

/**
 * @description
 * The data structure into which an import CSV file is parsed by the
 * {@link ImportParser} `parseProducts()` method.
 *
 * @docsCategory import-export
 * @docsPage ImportParser
 */
export interface ParsedProductWithVariants {
  product: ParsedProduct
  variants: ParsedProductVariant[]
}

/**
 * @description
 * The result returned by the {@link ImportParser} `parseProducts()` method.
 *
 * @docsCategory import-export
 * @docsPage ImportParser
 */
export interface ParseResult<T> {
  results: T[]
  errors: string[]
  processed: number
}

/**
 * @description
 * Validates and parses CSV files into a data structure which can then be used to created new entities.
 * This is used internally by the {@link Importer}.
 *
 * @docsCategory import-export
 * @docsPage ImportParser
 * @docsWeight 0
 */
@Injectable()
export class ImportParser {
  /** @internal */
  private slugStrategy: SlugStrategy
  constructor(private configService: ConfigService) {
    this.slugStrategy = this.configService.entityOptions.slugStrategy
  }

  /**
   * @description
   * Parses the contents of the [product import CSV file](/guides/developer-guide/importing-data/#product-import-format) and
   * returns a data structure which can then be used to populate Vendure using the {@link FastImporterService}.
   */
  async parseProducts(
    input: string | Stream,
    mainLanguage: LanguageCode = this.configService.defaultLanguageCode,
  ): Promise<ParseResult<ParsedProductWithVariants>> {
    const options: Options = {
      trim: true,
      relax_column_count: true,
    }
    return new Promise<ParseResult<ParsedProductWithVariants>>((resolve, reject) => {
      let errors: string[] = []

      if (typeof input === 'string') {
        parse(input, options, async (err: any, records: string[][]) => {
          if (err) {
            errors = errors.concat(err)
          }
          if (records) {
            const parseResult = await this.processRawRecords(records, mainLanguage)
            errors = errors.concat(parseResult.errors)
            resolve({ results: parseResult.results, errors, processed: parseResult.processed })
          } else {
            resolve({ results: [], errors, processed: 0 })
          }
        })
      } else {
        const parser = parse(options)
        const records: string[][] = []
        // input.on('open', () => input.pipe(parser));
        input.pipe(parser)
        parser.on('readable', () => {
          let record

          while ((record = parser.read())) {
            records.push(record)
          }
        })
        parser.on('error', reject)
        parser.on('end', async () => {
          const parseResult = await this.processRawRecords(records, mainLanguage)
          errors = errors.concat(parseResult.errors)
          resolve({ results: parseResult.results, errors, processed: parseResult.processed })
        })
      }
    })
  }

  private async processRawRecords(
    records: string[][],
    mainLanguage: LanguageCode,
  ): Promise<ParseResult<ParsedProductWithVariants>> {
    const results: ParsedProductWithVariants[] = []
    const errors: string[] = []
    let currentRow: ParsedProductWithVariants | undefined
    const headerRow = records[0]
    const rest = records.slice(1)
    const totalProducts = rest.map((row) => row[0]).filter((name) => name.trim() !== '').length
    const customFieldErrors = this.validateCustomFields(headerRow)
    if (customFieldErrors.length > 0) {
      return { results: [], errors: customFieldErrors, processed: 0 }
    }
    const translationError = this.validateHeaderTranslations(headerRow)
    if (translationError) {
      return { results: [], errors: [translationError], processed: 0 }
    }
    const columnError = validateRequiredColumns(headerRow)
    if (columnError) {
      return { results: [], errors: [columnError], processed: 0 }
    }
    const usedLanguages = usedLanguageCodes(headerRow)
    let line = 1
    for (const record of rest) {
      line++
      const columnCountError = validateColumnCount(headerRow, record)
      if (columnCountError) {
        errors.push(columnCountError + ` on line ${line}`)
        continue
      }
      const r = mapRowToObject(headerRow, record)
      if (getRawMainTranslation(r, 'name', mainLanguage)) {
        if (currentRow) {
          populateOptionGroupValues(currentRow)
          results.push(currentRow)
        }
        currentRow = {
          product: await this.parseProductFromRecord(r, usedLanguages, mainLanguage),
          variants: [await this.parseVariantFromRecord(r, usedLanguages, mainLanguage)],
        }
      } else {
        if (currentRow) {
          currentRow.variants.push(
            await this.parseVariantFromRecord(r, usedLanguages, mainLanguage),
          )
        }
      }
      const optionError = validateOptionValueCount(r, currentRow, mainLanguage)
      if (optionError) {
        errors.push(optionError + ` on line ${line}`)
      }
    }
    if (currentRow) {
      populateOptionGroupValues(currentRow)
      results.push(currentRow)
    }
    return { results, errors, processed: totalProducts }
  }

  private validateCustomFields(rowKeys: string[]): string[] {
    const errors: string[] = []
    for (const rowKey of rowKeys) {
      const baseKey = getBaseKey(rowKey)
      const parts = baseKey.split(':')
      if (parts.length === 1) {
        continue
      }
      if (parts.length === 2) {
        let customFieldConfigs: CustomFieldConfig[] = []
        if (parts[0] === 'product') {
          customFieldConfigs = this.configService.customFields.Product
        } else if (parts[0] === 'variant') {
          customFieldConfigs = this.configService.customFields.ProductVariant
        } else {
          continue
        }
        const customFieldConfig = customFieldConfigs.find((config) => config.name === parts[1])
        if (customFieldConfig) {
          continue
        }
      }
      errors.push(`Invalid custom field: ${rowKey}`)
    }
    return errors
  }

  private isTranslatable(baseKey: string): boolean {
    const parts = baseKey.split(':')
    if (parts.length === 1) {
      return baseTranslatableColumns.includes(baseKey)
    }
    if (parts.length === 2) {
      let customFieldConfigs: CustomFieldConfig[]
      if (parts[0] === 'product') {
        customFieldConfigs = this.configService.customFields.Product
      } else if (parts[0] === 'variant') {
        customFieldConfigs = this.configService.customFields.ProductVariant
      } else {
        throw new InternalServerError(`Invalid column header '${baseKey}'`)
      }
      const customFieldConfig = customFieldConfigs.find((config) => config.name === parts[1])
      if (!customFieldConfig) {
        throw new InternalServerError(
          `Could not find custom field config for column header '${baseKey}'`,
        )
      }
      return customFieldConfig.type === 'localeString'
    }
    throw new InternalServerError(`Invalid column header '${baseKey}'`)
  }

  private validateHeaderTranslations(rowKeys: string[]): string | undefined {
    const missing: string[] = []
    const languageCodes = usedLanguageCodes(rowKeys)
    const baseKeys = usedBaseKeys(rowKeys)
    for (const baseKey of baseKeys) {
      const translatedKeys = languageCodes.map((code) => [baseKey, code].join(':'))
      if (rowKeys.includes(baseKey)) {
        // Untranslated column header is used -> there should be no translated ones
        if (rowKeys.some((key) => translatedKeys.includes(key))) {
          return `The import file must not contain both translated and untranslated columns for field '${baseKey}'`
        }
      } else {
        if (!this.isTranslatable(baseKey) && translatedKeys.some((key) => rowKeys.includes(key))) {
          return `The '${baseKey}' field is not translatable.`
        }
        // All column headers must exist for all translations
        for (const translatedKey of translatedKeys) {
          if (!rowKeys.includes(translatedKey)) {
            missing.push(translatedKey)
          }
        }
      }
    }
    if (missing.length) {
      return `The import file is missing the following translations: ${missing
        .map((m) => `"${m}"`)
        .join(', ')}`
    }
  }

  private async parseProductFromRecord(
    r: { [key: string]: string },
    usedLanguages: LanguageCode[],
    mainLanguage: LanguageCode,
  ): Promise<ParsedProduct> {
    const translationCodes = usedLanguages.length === 0 ? [mainLanguage] : usedLanguages

    const optionGroups: ParsedOptionGroup[] = []
    for (const languageCode of translationCodes) {
      const rawTranslOptionGroups = r.hasOwnProperty(`optionGroups:${languageCode}`)
        ? r[`optionGroups:${languageCode}`]
        : r.optionGroups

      if (!rawTranslOptionGroups) {
        continue
      }
      const translatedOptionGroups = parseStringArray(rawTranslOptionGroups)
      if (optionGroups.length === 0) {
        for (const translatedOptionGroup of translatedOptionGroups) {
          optionGroups.push({ translations: [] })
        }
      }
      for (const i of optionGroups.map((optionGroup, index) => index)) {
        optionGroups[i].translations.push({
          languageCode,
          name: translatedOptionGroups[i],
          values: [],
        })
      }
    }

    const facets: ParsedFacet[] = []
    for (const languageCode of translationCodes) {
      const rawTranslatedFacets = r.hasOwnProperty(`facets:${languageCode}`)
        ? r[`facets:${languageCode}`]
        : r.facets

      if (!rawTranslatedFacets) {
        continue
      }

      const translatedFacets = parseStringArray(rawTranslatedFacets)
      if (facets.length === 0) {
        for (const translatedFacet of translatedFacets) {
          facets.push({ translations: [] })
        }
      }

      for (const i of facets.map((facet, index) => index)) {
        const [facet, value] = translatedFacets[i].split(':')
        facets[i].translations.push({
          languageCode,
          facet,
          value,
        })
      }
    }

    const translations = translationCodes.map(async (languageCode) => {
      const translatedFields = getRawTranslatedFields(r, languageCode)
      const parsedTranslatedCustomFields = parseCustomFields('product', translatedFields)
      const parsedUntranslatedCustomFields = parseCustomFields(
        'product',
        getRawUntranslatedFields(r),
      )
      const parsedCustomFields = {
        ...parsedUntranslatedCustomFields,
        ...parsedTranslatedCustomFields,
      }
      const name = translatedFields.hasOwnProperty('name')
        ? parseString(translatedFields.name)
        : r.name
      let slug: string
      if (translatedFields.hasOwnProperty('slug')) {
        slug = parseString(translatedFields.slug)
      } else {
        slug = parseString(r.slug)
      }
      if (slug.length === 0) {
        slug = await this.slugStrategy.generate(
          new RequestContext({
            apiType: 'admin',
            isAuthorized: true,
            authorizedAsOwnerOnly: false,
            channel: { id: 'default-channel' } as Channel,
            languageCode: languageCode,
          }),
          { value: name, entityName: 'Product', fieldName: 'slug' },
        )
      }
      return {
        languageCode,
        name,
        slug,
        description: translatedFields.hasOwnProperty('description')
          ? parseString(translatedFields.description)
          : r.description,
        customFields: parsedCustomFields,
      }
    })
    const jsonAssets = parseAssetsIfJson(r.assets)

    const parsedProduct: ParsedProduct = {
      assetPaths: jsonAssets.length ? jsonAssets.map(({ url }) => url) : parseStringArray(r.assets),
      assetsJson: jsonAssets,
      optionGroups,
      facets,
      translations: await Promise.all(translations),
    }
    return parsedProduct
  }

  private async parseVariantFromRecord(
    r: { [key: string]: string },
    usedLanguages: LanguageCode[],
    mainLanguage: LanguageCode,
  ): Promise<ParsedProductVariant> {
    const translationCodes = usedLanguages.length === 0 ? [mainLanguage] : usedLanguages

    const facets: ParsedFacet[] = []
    for (const languageCode of translationCodes) {
      const rawTranslatedFacets = r.hasOwnProperty(`variantFacets:${languageCode}`)
        ? r[`variantFacets:${languageCode}`]
        : r.variantFacets

      if (!rawTranslatedFacets) {
        continue
      }
      const translatedFacets = parseStringArray(rawTranslatedFacets)
      if (facets.length === 0) {
        for (const translatedFacet of translatedFacets) {
          facets.push({ translations: [] })
        }
      }
      for (const i of facets.map((facet, index) => index)) {
        const [facet, value] = translatedFacets[i].split(':')
        facets[i].translations.push({
          languageCode,
          facet,
          value,
        })
      }
    }

    const translations = translationCodes.map((languageCode) => {
      const rawTranslOptionValues = r.hasOwnProperty(`optionValues:${languageCode}`)
        ? r[`optionValues:${languageCode}`]
        : r.optionValues
      const translatedOptionValues = parseStringArray(rawTranslOptionValues)
      const translatedFields = getRawTranslatedFields(r, languageCode)
      const parsedTranslatedCustomFields = parseCustomFields('variant', translatedFields)
      const parsedUntranslatedCustomFields = parseCustomFields(
        'variant',
        getRawUntranslatedFields(r),
      )
      const parsedCustomFields = {
        ...parsedUntranslatedCustomFields,
        ...parsedTranslatedCustomFields,
      }
      return {
        languageCode,
        optionValues: translatedOptionValues,
        customFields: parsedCustomFields,
      }
    })

    const jsonAssets = parseAssetsIfJson(r.variantAssets)
    const variantIsEnabled = r.enabled == null || r.enabled === '' ? true : parseBoolean(r.enabled)
    const parsedVariant: ParsedProductVariant = {
      sku: parseString(r.sku),
      price: r.price ? parseNumber(r.price) : undefined,
      taxCategory: parseString(r.taxCategory),
      stockOnHand: parseNumber(r.stockOnHand),
      enabled: variantIsEnabled,
      trackInventory:
        r.trackInventory == null || r.trackInventory === ''
          ? GlobalFlag.INHERIT
          : parseBoolean(r.trackInventory)
            ? GlobalFlag.TRUE
            : GlobalFlag.FALSE,
      assetPaths: jsonAssets.length
        ? jsonAssets.map(({ url }) => url)
        : parseStringArray(r.variantAssets),
      assetsJson: jsonAssets,
      facets,
      translations,
    }
    return parsedVariant
  }
}

function populateOptionGroupValues(currentRow: ParsedProductWithVariants) {
  for (const translation of currentRow.product.translations) {
    const values = currentRow.variants.map((variant) => {
      const variantTranslation = variant.translations.find(
        (t) => t.languageCode === translation.languageCode,
      )
      if (!variantTranslation) {
        throw new InternalServerError(
          `No translation '${translation.languageCode}' for variant SKU '${variant.sku}'`,
        )
      }
      return variantTranslation.optionValues
    })
    currentRow.product.optionGroups.forEach((og, i) => {
      const ogTranslation = og.translations.find((t) => t.languageCode === translation.languageCode)
      if (ogTranslation) {
        ogTranslation.values = unique(values.map((v) => v[i]))
      } else {
        // throw new InternalServerError(
        //   `No translation '${translation.languageCode}' for option groups'`,
        // )
      }
    })
  }
}

function getLanguageCode(rowKey: string): LanguageCode | undefined {
  const parts = rowKey.split(':')
  if (parts.length === 2) {
    if (parts[1] in LanguageCode) {
      return parts[1] as LanguageCode
    }
  }
  if (parts.length === 3) {
    if (['product', 'productVariant'].includes(parts[0]) && parts[2] in LanguageCode) {
      return parts[2] as LanguageCode
    }
  }
}

function getBaseKey(rowKey: string): string {
  const parts = rowKey.split(':')
  if (getLanguageCode(rowKey)) {
    parts.pop()
    return parts.join(':')
  } else {
    return rowKey
  }
}

function usedLanguageCodes(rowKeys: string[]): LanguageCode[] {
  const languageCodes: LanguageCode[] = []
  for (const rowKey of rowKeys) {
    const languageCode = getLanguageCode(rowKey)
    if (languageCode && !languageCodes.includes(languageCode)) {
      languageCodes.push(languageCode)
    }
  }
  return languageCodes
}

function usedBaseKeys(rowKeys: string[]): string[] {
  const baseKeys: string[] = []
  for (const rowKey of rowKeys) {
    const baseKey = getBaseKey(rowKey)
    if (!baseKeys.includes(baseKey)) {
      baseKeys.push(baseKey)
    }
  }
  return baseKeys
}

function validateRequiredColumns(r: string[]): string | undefined {
  const rowKeys = r
  const missing: string[] = []
  const languageCodes = usedLanguageCodes(rowKeys)
  for (const col of requiredColumns) {
    if (!rowKeys.includes(col)) {
      if (languageCodes.length > 0 && rowKeys.includes(`${col}:${languageCodes[0]}`)) {
        continue // If one translation is present, they are all present (we did 'validateHeaderTranslations' before)
      }
      missing.push(col)
    }
  }
  if (missing.length) {
    return `The import file is missing the following columns: ${missing
      .map((m) => `"${m}"`)
      .join(', ')}`
  }
}

function validateColumnCount(columns: string[], row: string[]): string | undefined {
  if (columns.length !== row.length) {
    return `Invalid Record Length: header length is ${columns.length}, got ${row.length}`
  }
}

function mapRowToObject(columns: string[], row: string[]): { [key: string]: string } {
  return row.reduce((obj, val, i) => {
    return { ...obj, [columns[i]]: val }
  }, {})
}

function validateOptionValueCount(
  r: { [key: string]: string },
  currentRow?: ParsedProductWithVariants,
  mainLanguage?: LanguageCode,
): string | undefined {
  if (!currentRow) {
    return
  }

  const optionValueKeys = Object.keys(r).filter((key) => key.startsWith('optionValues'))
  for (const key of optionValueKeys) {
    const optionValues = parseStringArray(r[key])
    if (currentRow.product.optionGroups.length !== optionValues.length && key === mainLanguage) {
      return `The number of optionValues in column '${key}' must match the number of optionGroups`
    }
  }
}

function getRawMainTranslation(
  r: { [key: string]: string },
  field: string,
  mainLanguage: LanguageCode,
): string {
  if (r.hasOwnProperty(field)) {
    return r[field]
  } else {
    return r[`${field}:${mainLanguage}`]
  }
}

function getRawTranslatedFields(
  r: { [key: string]: string },
  languageCode: LanguageCode,
): { [key: string]: string } {
  return Object.entries(r)
    .filter(([key, value]) => key.endsWith(`:${languageCode}`))
    .reduce((output, [key, value]) => {
      const fieldName = key.replace(`:${languageCode}`, '')
      return {
        ...output,
        [fieldName]: value,
      }
    }, {})
}

function getRawUntranslatedFields(r: { [key: string]: string }): { [key: string]: string } {
  return Object.entries(r)
    .filter(([key, value]) => {
      return !getLanguageCode(key)
    })
    .reduce((output, [key, value]) => {
      return {
        ...output,
        [key]: value,
      }
    }, {})
}

function isRelationObject(value: string) {
  try {
    const parsed = JSON.parse(value)
    return parsed && parsed.hasOwnProperty('id')
  } catch (e: any) {
    return false
  }
}

function parseCustomFields(
  prefix: 'product' | 'variant',
  r: { [key: string]: string },
): { [name: string]: string } {
  return Object.entries(r)
    .filter(([key, value]) => {
      return key.indexOf(`${prefix}:`) === 0
    })
    .reduce((output, [key, value]) => {
      const fieldName = key.replace(`${prefix}:`, '')
      return {
        ...output,
        [fieldName]: isRelationObject(value) ? JSON.parse(value) : value,
      }
    }, {})
}

function parseString(input?: string): string {
  return (input || '').trim()
}

function parseNumber(input?: string): number {
  return +(input || '').trim()
}

function parseBoolean(input?: string): boolean {
  if (input == null) {
    return false
  }
  switch (input.toLowerCase()) {
    case 'true':
    case '1':
    case 'yes':
      return true
    default:
      return false
  }
}

function parseStringArray(input?: string, separator = '|'): string[] {
  return (input || '')
    .trim()
    .split(separator)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

function parseAssetsIfJson(input: string): ParsedAsset[] {
  try {
    if (startsWith(input, '{') || startsWith(input, '[')) {
      if (typeof input === 'string') {
        const parsed = JSON.parse(
          input.replace(/'/g, '"').replace(/\s+/g, ' ').replace(/,\s*'/g, ", '"),
        )
        return Array.isArray(parsed) ? parsed : [parsed]
      } else {
        return input
      }
    }
  } catch (e) {
    return []
  }
  return []
}
