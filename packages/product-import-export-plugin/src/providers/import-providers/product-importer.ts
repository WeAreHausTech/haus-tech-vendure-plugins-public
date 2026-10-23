/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Inject, Injectable } from '@nestjs/common'
import {
  ConfigService,
  ChannelService,
  FacetService,
  FacetValueService,
  TaxCategoryService,
  ID,
  Facet,
  ImportProgress,
  LanguageCode,
  OnProgressFn,
  CustomFieldConfig,
  ParsedFacet,
  TaxCategory,
  ProductService,
  TransactionalConnection,
  TranslatableSaver,
  ParseResult,
  AssetService,
  ProductOptionGroupService,
  RelationCustomFieldConfig,
  SlugStrategy,
  StructCustomFieldConfig,
} from '@vendure/core'
import {
  FacetValue,
  RequestContext,
  InternalServerError,
  Product,
  ProductVariant,
  Asset,
  ProductOptionGroup,
  Logger,
  ProductAsset,
} from '@vendure/core'
import { Stream } from 'stream'
import { parse as parseCsv } from 'csv-parse/sync'
import { Observable } from 'rxjs'
import { getGraphQlInputName } from '@vendure/common/lib/shared-utils'
import { ImportInfo } from '@vendure/common/lib/generated-types'
import { AssetType } from '@vendure/common/lib/generated-types'
import { ExtendedFastImporterService } from '../../services/extended-fast-importer.service'
import { compact, find, isUndefined, startsWith } from 'lodash'
import { JsonAsset, ParsedProductWithId, UpdatingStrategy } from '../../types'
import {
  IMPORT_ROW_VALIDATION_STRATEGY,
  PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS,
} from '../../constants'
import { PluginInitOptions } from '../../types'
import { ImportParser } from './import-parser'
import { ExtendedAssetImporter } from './asset-importer'
import { In, IsNull } from 'typeorm'
import { generateAssetHash } from '../../helpers/generate-asset-hash'
import { createHash } from 'crypto'
import { removeUpdatedAtFields } from '../../helpers/remove-update-at-fields'
import {
  RelationLookup,
  RelationLookupResolver,
  RelationLookupResult,
  relationLookupKey,
  splitLookupList,
} from '../../services/relation-lookup-resolver'
import {
  DefaultImportRowValidationStrategy,
  ImportRowValidationStrategy,
} from '../../strategies/import-row-validation-strategy'
import { toImportRowGroups } from '../../services/import-row-groups'
import {
  CHANNELS_COLUMN,
  ChannelColumnResolver,
  ChannelsByToken,
} from '../../services/channel-column-resolver'
import {
  importCsvHeaders,
  importCsvLines,
  normalizeHeader,
  splitCsvLine,
} from '../../helpers/import-csv-lines'

/** The relation columns of one import whose values are not ids, and the id behind each value. */
type RelationLookups = Pick<RelationLookupResult, 'fields' | 'idsByLookup'>

const NO_RELATION_LOOKUPS: RelationLookups = { fields: new Map(), idsByLookup: new Map() }

/** The outcome of an import. `rejected` is set when the file was checked and nothing was written. */
export type ImportResult = ImportInfo & { rejected?: boolean }

/** What the checks before any write find in an import file. */
export interface CheckedImportFile {
  /** Lookup and row validation errors, ordered by row. Any error stops the whole import. */
  errors: string[]
  relationLookups: RelationLookups
  /** The parsed file; missing when a lookup header was wrong, so no row was read. */
  parsed?: ParseResult<ParsedProductWithId>
  customFieldTypes: Record<string, string>
  /** The channels the `channels` column names; empty when the file has no such column. */
  channelsByToken: ChannelsByToken
}

/** The row an error names (`Row 12: ...`), 0 for an error about the whole file. */
function errorRow(error: string): number {
  const match = /^Row (\d+):/.exec(error)
  return match ? Number(match[1]) : 0
}

/**
 * Splits a typed custom field header (`product:field:type`, or with a fourth lookup segment that
 * RelationLookupResolver reads) into the `<owner>:<field>` key the parser checks and the type.
 */
function splitTypedCustomFieldHeader(
  header: string,
): { fullFieldName: string; type: string } | undefined {
  if (!header.startsWith('product:') && !header.startsWith('variant:')) {
    return undefined
  }
  const parts = header.split(':')
  if (parts.length !== 3 && parts.length !== 4) {
    return undefined
  }
  const [prefix, fieldName, type] = parts
  return { fullFieldName: `${prefix}:${fieldName}`, type: type.trim() }
}

@Injectable()
export class ProductImporter {
  private taxCategoryMatches: { [name: string]: ID } = {}
  private facetMap = new Map<string, Facet>()
  private facetValueMap = new Map<string, FacetValue>()
  private customFieldTypes: Record<string, string> = {}
  private allAssets: Asset[] = []
  private allAssetsById = new Map<ID, Asset>()
  private allAssetsBySource = new Map<string, Asset>()
  private facetIdCache = new Map<string, ID>()
  private facetValueIdCache = new Map<string, ID>()

  private slugStrategy: SlugStrategy

  constructor(
    private connection: TransactionalConnection,
    private configService: ConfigService,

    private importParser: ImportParser,
    private assetImporter: ExtendedAssetImporter,
    private fastImporter: ExtendedFastImporterService,
    private translatableSaver: TranslatableSaver,

    private productService: ProductService,
    private channelService: ChannelService,
    private facetService: FacetService,
    private facetValueService: FacetValueService,
    private taxCategoryService: TaxCategoryService,
    private assetService: AssetService,
    private optionGroupService: ProductOptionGroupService,
    @Inject(PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS) private pluginOptions: PluginInitOptions,
    private relationLookupResolver: RelationLookupResolver,
    @Inject(IMPORT_ROW_VALIDATION_STRATEGY)
    private rowValidationStrategy: ImportRowValidationStrategy,
    private channelColumnResolver: ChannelColumnResolver,
  ) {
    this.slugStrategy = this.configService.entityOptions.slugStrategy
  }

  parseAndImport(
    input: string | Stream,
    ctx: RequestContext,
    updateProductSlug = true,
    mainLanguage: LanguageCode,
    updatingStrategy: UpdatingStrategy,
  ): Observable<ImportProgress & { rejected?: boolean }> {
    return new Observable((subscriber) => {
      const p = this.doParseAndImport(
        input,
        updateProductSlug,
        mainLanguage,
        updatingStrategy,
        ctx,
        (progress) => {
          subscriber.next(progress)
        },
      ).then(
        (value) => {
          subscriber.next({ ...value, currentProduct: 'Complete' })
          subscriber.complete()
        },
        (error) => subscriber.error(error),
      )
    })
  }

  /**
   * Column 0 of every data record as a product id, null when empty or not a number. Index 0 is
   * line 2, counted in records as the parser counts them, so a quoted cell that spans several
   * physical lines does not shift the ids.
   */
  private extractProductIdsFromCSV(csvString: string): (number | null)[] {
    let records: string[][]
    try {
      records = parseCsv(csvString, {
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
      }) as string[][]
    } catch {
      // The parser cannot read the file either, so there are no products to give ids to.
      return []
    }
    return records.slice(1).map((record) => {
      const productId = parseInt(record[0] ?? '', 10)
      return Number.isNaN(productId) ? null : productId
    })
  }

  /**
   * The problems in the file's header row, checked the way the import job checks it. Empty when
   * the job can read every column; the upload runs this so a wrong header never gets queued.
   */
  validateHeader(csv: string): string[] {
    const headers = importCsvHeaders(importCsvLines(csv)).map(
      (header) => splitTypedCustomFieldHeader(header)?.fullFieldName ?? header,
    )
    return this.importParser.validateHeader(headers)
  }

  /**
   * Everything that is checked before an import writes anything: relation lookups, then the parsed
   * rows through the row validation strategy. The upload runs this before the file is stored, and
   * the import job runs it again before its first write, since data can change while the job waits.
   * With the default strategy and no `channels` column the file is parsed only when `parse` asks
   * for it (the job does), so such an upload costs no more than the lookups. `uploader` is the
   * context whose user needs rights in the channels the `channels` column names; the job passes
   * the uploader's, since it imports with a context of its own.
   */
  async checkFile(
    ctx: RequestContext,
    csv: string,
    mainLanguage: LanguageCode,
    updateProductSlug: boolean,
    { parse = false, uploader = ctx }: { parse?: boolean; uploader?: RequestContext } = {},
  ): Promise<CheckedImportFile> {
    const unchecked = { customFieldTypes: {}, channelsByToken: new Map() }
    const relationLookups = await this.relationLookupResolver.resolve(ctx, csv)
    if (!relationLookups.rowsChecked) {
      return { errors: relationLookups.errors, relationLookups, ...unchecked }
    }
    // Only the default itself is skipped: a subclass of it has rules of its own.
    const validatesRows =
      this.rowValidationStrategy.constructor !== DefaultImportRowValidationStrategy
    const namesChannels = importCsvHeaders(importCsvLines(csv)).includes(CHANNELS_COLUMN)
    if (!validatesRows && !namesChannels && !parse) {
      return { errors: relationLookups.errors, relationLookups, ...unchecked }
    }

    const { cleanedCsv, customFieldTypes } = this.preprocessCsv(csv, updateProductSlug)
    const parsed = (await this.importParser.parseProducts(
      cleanedCsv,
      mainLanguage,
    )) as ParseResult<ParsedProductWithId>
    const productIds = this.extractProductIdsFromCSV(cleanedCsv)
    for (const result of parsed.results) {
      // The id on the product's own first row, not on the line with the product's index.
      const productId = result.product.line ? productIds[result.product.line - 2] : null
      if (productId != null) {
        result.product.productId = productId
      }
    }

    const rowErrors = validatesRows
      ? await this.rowValidationStrategy.validate(
          ctx,
          toImportRowGroups(parsed.results, relationLookups, this.configService.customFields),
        )
      : []
    const channelColumn = await this.channelColumnResolver.resolve(ctx, uploader, parsed.results)
    const errors = [
      ...relationLookups.errors,
      ...channelColumn.errors,
      ...rowErrors.map(({ line, message }) => `Row ${line}: ${message}`),
    ].sort((a, b) => errorRow(a) - errorRow(b))
    return {
      errors,
      relationLookups,
      parsed,
      customFieldTypes,
      channelsByToken: channelColumn.channelsByToken,
    }
  }

  private preprocessCsv(
    input: string,
    updateProductSlug: boolean,
  ): {
    cleanedCsv: string
    customFieldTypes: Record<string, string>
  } {
    const customFieldTypes: Record<string, string> = {}

    // Without blank and comma-only lines, as RelationLookupResolver reads the file
    const filteredLines = importCsvLines(input)

    const headers = splitCsvLine(filteredLines[0])

    const cleanedHeaders = headers.map((rawHeader) => {
      const typed = splitTypedCustomFieldHeader(normalizeHeader(rawHeader))
      if (!typed) {
        return rawHeader
      }
      customFieldTypes[typed.fullFieldName] = typed.type
      return typed.fullFieldName
    })

    // Recreate the CSV with cleaned headers
    filteredLines[0] = cleanedHeaders.join(',')

    // If the updateProductSlug flag is set, find all slug columns and set their values to an empty string.
    if (updateProductSlug) {
      const slugIndices = cleanedHeaders
        .map((header, index) => (header.includes('slug') ? index : -1))
        .filter((index) => index !== -1) // Get all indices of columns that contain 'slug'

      if (slugIndices.length > 0) {
        filteredLines.forEach((line, index) => {
          if (index === 0) return // Skip header row
          const columns = splitCsvLine(line)
          slugIndices.forEach((slugIndex) => {
            columns[slugIndex] = '' // Clear each slug column
          })
          filteredLines[index] = columns.join(',') // Reassemble the line
        })
      }
    }

    return {
      cleanedCsv: filteredLines.join('\n'), // Join the filtered lines
      customFieldTypes,
    }
  }

  private async streamToString(stream: Stream): Promise<string> {
    const chunks: Uint8Array[] = []
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(chunk))
      stream.on('error', reject)
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    })
  }

  async getAllAssets(ctx: RequestContext): Promise<Asset[]> {
    let offset = 0
    const limit = 100
    const assets: Asset[] = []
    let totalItems = 0
    do {
      const paginatedAssets = await this.assetService.findAll(ctx, { take: limit, skip: offset })
      assets.push(...paginatedAssets.items)
      totalItems = paginatedAssets.totalItems
      offset += limit
    } while (assets.length < totalItems)

    return assets
  }

  async setMissingAssetHashes(ctx: RequestContext): Promise<void> {
    const assets = await this.getAllAssets(ctx)
    const assetsWithoutHash = assets.filter((asset) => !asset.customFields.hash)
    for (const asset of assetsWithoutHash) {
      const hash = generateAssetHash(asset)
      if (asset.customFields.hash !== hash) {
        asset.customFields.hash = hash
        await this.connection.getRepository(ctx, Asset).save(asset)
      }
    }

    this.allAssets = assets
    this.allAssetsById = new Map(assets.map((asset) => [asset.id, asset]))
    this.allAssetsBySource = new Map(assets.map((asset) => [asset.source, asset]))
  }

  private async doParseAndImport(
    input: string | Stream,
    updateProductSlug: boolean,
    mainLanguage: LanguageCode,
    updatingStrategy: UpdatingStrategy,
    reqCtx: RequestContext,
    onProgress: OnProgressFn,
  ): Promise<ImportResult> {
    // Per-import caches to avoid stale cross-job state.
    this.facetIdCache.clear()
    this.facetValueIdCache.clear()

    const ctx = await this.getRequestContext(reqCtx, mainLanguage)

    let csvContent: string

    if (typeof input === 'string') {
      csvContent = input
    } else {
      // If input is a Stream, you need to read it fully into memory
      csvContent = await this.streamToString(input)
    }

    // Checked again here, before the first write, not only on upload: data can change while the
    // job waits. Lookup values are resolved once, here: a row deleted while the import runs is
    // still linked to.
    const { errors, relationLookups, parsed, customFieldTypes, channelsByToken } =
      await this.checkFile(ctx, csvContent, mainLanguage, updateProductSlug, {
        parse: true,
        uploader: reqCtx,
      })
    if (errors.length > 0 || !parsed) {
      // Never fail a job without saying why.
      const reasons = errors.length > 0 ? errors : ['The import file could not be read']
      return { errors: reasons, imported: 0, processed: 0, rejected: true }
    }

    await this.setMissingAssetHashes(ctx)
    this.customFieldTypes = customFieldTypes

    if (parsed.results.length) {
      try {
        const importErrors = await this.importProducts(
          ctx,
          parsed.results,
          updatingStrategy,
          (progess) => {
            onProgress({
              ...progess,
              processed: parsed.processed,
            })
          },
          relationLookups,
          channelsByToken,
        )
        return {
          errors: parsed.errors.concat(importErrors),
          imported: parsed.results.length,
          processed: parsed.processed,
        }
      } catch (err: any) {
        Logger.error('Error while importing products:', 'ProductImporter', err?.stack)
        return {
          errors: [err.message],
          imported: 0,
          processed: parsed.processed,
        }
      }
    } else {
      return {
        errors: parsed.errors,
        imported: 0,
        processed: parsed.processed,
      }
    }
  }

  private async getRequestContext(
    ctx: RequestContext,
    mainLanguage: LanguageCode,
  ): Promise<RequestContext> {
    if (ctx instanceof RequestContext) {
      return new RequestContext({
        apiType: 'admin',
        isAuthorized: true,
        authorizedAsOwnerOnly: false,
        channel: ctx.channel,
        languageCode: mainLanguage,
      })
    } else {
      throw new InternalServerError('No RequestContext provided')
    }
  }

  async importProducts(
    ctx: RequestContext,
    rows: ParsedProductWithId[],
    updatingStrategy: UpdatingStrategy,
    onProgress: OnProgressFn,
    relationLookups: RelationLookups = NO_RELATION_LOOKUPS,
    channelsByToken: ChannelsByToken = new Map(),
  ): Promise<string[]> {
    let errors: string[] = []
    let imported = 0
    const languageCode = ctx.languageCode
    let taxCategories = await this.taxCategoryService.findAll(ctx)

    // Create taxCategory if none exists, and read the list again so the rows can match it
    if (taxCategories.totalItems === 0) {
      await this.taxCategoryService.create(ctx, {
        name: 'Standard Tax',
        isDefault: true,
      })
      taxCategories = await this.taxCategoryService.findAll(ctx)
    }
    await this.fastImporter.initialize(ctx.channel)

    const shouldRestore =
      this.pluginOptions?.importOptions?.defaultOptions?.restoreSoftDeleted !== false

    const sharedGroupMap = await this.buildSharedOptionGroupMap(ctx, rows)

    for (const { product, variants } of rows) {
      this.fastImporter.setProductChannels(
        compact(product.channelTokens.map((token) => channelsByToken.get(token))),
      )
      const productMainTranslation = this.getTranslationByCodeOrFirst(
        product.translations,
        ctx.languageCode,
      )

      const createProductAssets = await this.resolveAssets(
        product.assetPaths,
        product.assetsJson,
        ctx,
      )
      const productAssets = createProductAssets.assets

      if (createProductAssets.errors.length) {
        errors = errors.concat(createProductAssets.errors)
      }

      const customFields = await this.processCustomFieldValues(
        product.translations[0].customFields,
        this.configService.customFields.Product,
        ctx,
        'product',
        relationLookups,
      )

      let checkExistingProduct

      if (product.productId) {
        checkExistingProduct = await this.productService.findOne(ctx, product.productId)
      }

      if (!checkExistingProduct) {
        const variantSkus = variants.map((v) => v.sku)
        const foundVariants = await this.connection.getRepository(ctx, ProductVariant).findBy({
          sku: In(variantSkus),
        })
        const variantsWhereDeletedAtUndefined = foundVariants.filter((v) => {
          return !v.deletedAt
        })

        if (variantsWhereDeletedAtUndefined.length) {
          checkExistingProduct = shouldRestore
            ? { id: foundVariants[0].productId }
            : { id: variantsWhereDeletedAtUndefined[0].productId, deletedAt: IsNull() }
        }
      }

      let existingProduct = await this.getProductByIdWithRelations(
        ctx,
        checkExistingProduct?.id,
        shouldRestore,
      )

      try {
        if (existingProduct?.deletedAt) {
          if (shouldRestore) {
            existingProduct.deletedAt = null
            try {
              await this.connection.getRepository(ctx, Product).save([existingProduct])
            } catch (error: any) {
              errors.push(`Error while restoring the product: ${error}`)
              Logger.error('Error while restoring the product:', 'ProductImporter', error?.stack)
            }
          } else {
            existingProduct = undefined
          }
        }
      } catch (error: any) {
        errors.push(`Error while restoring the product: ${error}`)
        Logger.error('Error while restoring the product:', 'ProductImporter', error?.stack)
      }

      const existingProductName = existingProduct?.translations.find(
        (t) => t.languageCode === languageCode,
      )?.name
      const productNameHasChanged =
        existingProduct && existingProductName !== productMainTranslation.name
          ? {
              name: productMainTranslation.name,
              previousName: existingProductName,
              normalizedName: await this.slugStrategy.generate(ctx, {
                value: productMainTranslation.name,
                entityName: 'Product',
                fieldName: 'name',
              }),
              previousNormalizedName: await this.slugStrategy.generate(ctx, {
                value: existingProductName || '',
                entityName: 'Product',
                fieldName: 'name',
              }),
            }
          : undefined

      if (existingProduct && updatingStrategy === 'replace') {
        await this.fastImporter.removeAllAssetsFromProduct(existingProduct)
      }

      const productData = {
        featuredAssetId: this.resolveFeaturedAssetId(
          productAssets,
          existingProduct?.featuredAsset,
          updatingStrategy,
        ),
        assetIds: productAssets.map((a) => a.id),
        facetValueIds: updatingStrategy === 'replace' ? [] : undefined,
        translations: await Promise.all(
          product.translations.map(async (translation) => {
            const existingTranslation = existingProduct?.translations.find((t) => {
              return t.languageCode === translation.languageCode
            })
            return {
              languageCode: translation.languageCode,
              name: translation.name,
              ...(translation.description !== undefined
                ? { description: translation.description }
                : {}),
              slug: existingTranslation?.slug || translation.slug,
              customFields: await this.processCustomFieldValues(
                translation.customFields,
                this.configService.customFields.Product,
                ctx,
                'product',
                relationLookups,
              ),
            }
          }),
        ),
        customFields,
      }

      const createdProductId = existingProduct
        ? await this.fastImporter.updateProduct(existingProduct.id, {
            ...productData,
            id: existingProduct.id,
          })
        : await this.fastImporter.createProduct(productData)

      for (const facet of product.facets) {
        const facetMainTranslation = this.getTranslationByCodeOrFirst(
          facet.translations,
          ctx.languageCode,
        )
        const code = await this.slugStrategy.generate(ctx, {
          value: facetMainTranslation.facet,
          entityName: 'Facet',
          fieldName: 'code',
        })
        const valueCode = await this.slugStrategy.generate(ctx, {
          value: facetMainTranslation.value,
          entityName: 'FacetValue',
          fieldName: 'value',
        })
        const facetValueId = await this.createFacetAndValue(facet, code, valueCode)

        await this.fastImporter.addFacetValueToProduct(createdProductId, facetValueId)
      }

      const optionsMap: { [optionName: string]: ID } = {}
      const shouldUpdateOptions =
        product.optionGroupsProvided || variants.some((variant) => variant.optionValuesProvided)

      if (shouldUpdateOptions) {
        await this.fastImporter.removeOptionGroupsFromProduct(createdProductId)
        const productOptionsGroups = await this.optionGroupService.getOptionGroupsByProductId(
          ctx,
          createdProductId,
        )

        for (const [optionGroup, optionGroupIndex] of product.optionGroups.map(
          (group, i) => [group, i] as const,
        )) {
          const optionGroupMainTranslation = this.getTranslationByCodeOrFirst(
            optionGroup.translations,
            ctx.languageCode,
          )

          const sharedGroupEntry = optionGroup.code
            ? sharedGroupMap.get(optionGroup.code)
            : undefined
          if (sharedGroupEntry) {
            await this.fastImporter.addOptionGroupToProduct(
              createdProductId,
              sharedGroupEntry.groupId,
            )
            for (const value of optionGroupMainTranslation.values) {
              const optionId = sharedGroupEntry.optionIds.get(value)
              if (!optionId) {
                throw new InternalServerError(
                  `Option value "${value}" not found in shared option group "${optionGroup.code ?? ''}"`,
                )
              }
              optionsMap[`${optionGroupIndex}_${value}`] = optionId
            }
            continue
          }

          const productScopedCode = await this.slugStrategy.generate(ctx, {
            value: `${productMainTranslation.name}-${optionGroupMainTranslation.name}`,
            entityName: 'ProductOptionGroup',
            fieldName: 'code',
          })
          const previousProductScopedCode = await this.slugStrategy.generate(ctx, {
            value: `${productNameHasChanged?.previousName}-${optionGroupMainTranslation.name}`,
            entityName: 'ProductOptionGroup',
            fieldName: 'code',
          })
          const existingProductScopedGroup = productOptionsGroups.find(
            (group) => group.code === previousProductScopedCode,
          )

          const productScopedGroupId = existingProductScopedGroup
            ? await this.fastImporter.updateProductOptionGroup({
                id: existingProductScopedGroup.id,
                code: productScopedCode,
                options: optionGroupMainTranslation.values.map((name) => ({}) as any),
                translations: optionGroup.translations
                  .map((translation) => {
                    return {
                      languageCode: translation.languageCode,
                      name: translation.name,
                    }
                  })
                  .filter((t) => t.name),
              })
            : await this.fastImporter.createProductOptionGroup({
                code: productScopedCode,
                options: optionGroupMainTranslation.values.map((name) => ({}) as any),
                translations: optionGroup.translations
                  .map((translation) => {
                    return {
                      languageCode: translation.languageCode,
                      name: translation.name,
                    }
                  })
                  .filter((t) => t.name),
              })

          for (const [optionIndex, value] of optionGroupMainTranslation.values.map(
            (val, index) => [index, val] as const,
          )) {
            const createdOptionId = await this.fastImporter.createProductOption({
              productOptionGroupId: productScopedGroupId,
              code: await this.slugStrategy.generate(ctx, {
                value,
                entityName: 'ProductOption',
                fieldName: 'code',
              }),
              translations: optionGroup.translations
                .map((translation) => {
                  return {
                    languageCode: translation.languageCode,
                    name: translation.values[optionIndex],
                  }
                })
                .filter((t) => t.name),
            })
            optionsMap[`${optionGroupIndex}_${value}`] = createdOptionId
          }
          await this.fastImporter.addOptionGroupToProduct(createdProductId, productScopedGroupId)
        }
      }

      for (const variant of variants) {
        const variantMainTranslation = this.getTranslationByCodeOrFirst(
          variant.translations,
          ctx.languageCode,
        )

        const createVariantAssets = await this.resolveAssets(variant.assetPaths, variant.assetsJson)
        const variantAssets = createVariantAssets.assets

        if (createVariantAssets.errors.length) {
          errors = errors.concat(createVariantAssets.errors)
        }

        // let facetValueIds: ID[] = []

        // if (0 < variant.facets.length) {
        //   facetValueIds = await this.getFacetValueIds(ctx, variant.facets, languageCode)
        // }

        const variantCustomFields = await this.processCustomFieldValues(
          variantMainTranslation.customFields,
          this.configService.customFields.ProductVariant,
          ctx,
          'variant',
          relationLookups,
        )

        const optionIds = shouldUpdateOptions
          ? variantMainTranslation.optionValues.map((v, index) => optionsMap[`${index}_${v}`])
          : undefined

        let existingVariant = await this.connection.getRepository(ctx, ProductVariant).findOne({
          where: {
            sku: variant.sku,
            deletedAt: shouldRestore ? undefined : IsNull(),
            productId: createdProductId,
          },
          withDeleted: shouldRestore,
          relations: ['facetValues', 'facetValues.facet', 'assets', 'featuredAsset'],
        })

        if (existingVariant?.deletedAt) {
          if (shouldRestore) {
            existingVariant.deletedAt = null
            try {
              await this.connection.getRepository(ctx, ProductVariant).save([existingVariant])
            } catch (error: any) {
              errors.push(`Error while restoring the variant: ${error}`)
              Logger.error('Error while restoring the variant:', 'ProductImporter', error?.stack)
            }
          } else {
            // Treat the soft-deleted variant as non-existent so that a new variant gets created

            existingVariant = undefined as any
          }
        }

        if (existingVariant && updatingStrategy === 'replace') {
          // Remove all assets from the product
          await this.fastImporter.removeAllAssetsFromVariant(existingVariant)
        }

        const variantData = {
          productId: createdProductId,
          facetValueIds: updatingStrategy === 'replace' ? [] : undefined,
          featuredAssetId: this.resolveFeaturedAssetId(
            variantAssets,
            existingVariant?.featuredAsset,
            updatingStrategy,
          ),
          assetIds: variantAssets.map((a) => a.id),
          sku: variant.sku,
          // A ProductVariant must always have a tax category. When updating, only overwrite it if a
          // `taxCategory` column was provided; when creating a new variant, always assign one
          // (falling back to the default/first tax category) so it is never left null.
          ...(variant.taxCategory !== undefined || !existingVariant
            ? {
                taxCategoryId: this.getMatchingTaxCategoryId(
                  variant.taxCategory,
                  taxCategories.items,
                ),
              }
            : {}),
          ...(variant.stockOnHand !== undefined ? { stockOnHand: variant.stockOnHand } : {}),
          ...(variant.trackInventory !== undefined
            ? { trackInventory: variant.trackInventory }
            : {}),
          ...(variant.enabled !== undefined ? { enabled: variant.enabled } : {}),
          ...(optionIds !== undefined ? { optionIds } : {}),
          translations: await Promise.all(
            variant.translations.map(async (translation) => {
              const productTranslation = product.translations.find(
                (t) => t.languageCode === translation.languageCode,
              )
              if (!productTranslation) {
                throw new InternalServerError(
                  `No translation '${translation.languageCode}' for product with slug '${productMainTranslation.slug}'`,
                )
              }
              return {
                languageCode: translation.languageCode,
                name: [productTranslation.name, ...translation.optionValues].join(' '),
                customFields: await this.processCustomFieldValues(
                  translation.customFields,
                  this.configService.customFields.ProductVariant,
                  ctx,
                  'variant',
                  relationLookups,
                ),
              }
            }),
          ),
          price: isUndefined(variant.price) ? undefined : Math.round(variant.price * 100),
          customFields: variantCustomFields,
        }

        const createdVariantId = existingVariant
          ? await this.fastImporter.updateProductVariant({ ...variantData, id: existingVariant.id })
          : await this.fastImporter.createProductVariant(variantData)

        for (const facet of variant.facets) {
          const facetMainTranslation = this.getTranslationByCodeOrFirst(
            facet.translations,
            ctx.languageCode,
          )
          const code = await this.slugStrategy.generate(ctx, {
            value: facetMainTranslation.facet,
            entityName: 'Facet',
            fieldName: 'code',
          })
          const valueCode = await this.slugStrategy.generate(ctx, {
            value: facetMainTranslation.value,
            entityName: 'FacetValue',
            fieldName: 'value',
          })

          const facetValueId = await this.createFacetAndValue(facet, code, valueCode)

          await this.fastImporter.addFacetValueToProductVariant(createdVariantId, facetValueId)
        }
      }

      if (existingProduct) {
        const productAfterUpdate = (await this.getProductByIdWithRelations(
          ctx,
          createdProductId,
          false,
        )) as Product // We know that the product exists, so we can safely cast it to Product
        const existingProductHash = createHash('md5')
          .update(JSON.stringify(removeUpdatedAtFields(existingProduct!)))
          .digest('hex')
        const productAfterUpdateHash = createHash('md5')
          .update(JSON.stringify(removeUpdatedAtFields(productAfterUpdate!)))
          .digest('hex')
        // Update product updatedAt to existing product updatedAt
        if (existingProductHash === productAfterUpdateHash) {
          await this.connection.getRepository(ctx, Product).update(productAfterUpdate.id, {
            updatedAt: existingProduct.updatedAt,
          })
        }
      }

      imported++
      onProgress({
        processed: 0,
        imported,
        errors,
        currentProduct: productMainTranslation.name,
      })
    }

    return errors
  }

  // private async getFacetValueIds(
  //   ctx: RequestContext,
  //   facets: ParsedFacet[],
  //   languageCode: LanguageCode,
  // ): Promise<ID[]> {
  //   const facetValueIds: ID[] = []
  //   for (const item of facets) {
  //     const itemMainTranslation = this.getTranslationByCodeOrFirst(item.translations, languageCode)
  //     const facetName = itemMainTranslation.facet
  //     const valueName = itemMainTranslation.value

  //     let facetEntity: Facet
  //     const cachedFacet = this.facetMap.get(facetName)
  //     if (cachedFacet?.code === 'kategorier') {
  //       console.log('cachedFacet', cachedFacet)
  //     }

  //     if (cachedFacet) {
  //       facetEntity = cachedFacet
  //     } else {
  //       const existing = await this.facetService.findByCode(
  //         ctx,
  //         normalizeString(facetName, '-', languageCode),
  //         languageCode,
  //       )
  //       if (existing) {
  //         if (existing?.code === 'kategorier') {
  //           console.log('existingFacet', existing)
  //         }
  //         facetEntity = existing
  //       } else {
  //         facetEntity = await this.facetService.create(ctx, {
  //           isPrivate: false,
  //           code: normalizeString(facetName, '-', languageCode),
  //           translations: item.translations.map((translation) => {
  //             return {
  //               languageCode: translation.languageCode,
  //               name: translation.facet,
  //             }
  //           }),
  //         })
  //       }
  //       this.facetMap.set(facetName, facetEntity)
  //     }

  //     let facetValueEntity: FacetValue
  //     const facetValueMapKey = `${facetName}:${valueName}`
  //     const cachedFacetValue = this.facetValueMap.get(facetValueMapKey)
  //     if (cachedFacetValue) {
  //       facetValueEntity = cachedFacetValue
  //       if (cachedFacetValue?.code === 'duschhoerna') {
  //         console.log('cachedFacetValue', cachedFacetValue)
  //       }
  //     } else {
  //       const existing = facetEntity.values.find(
  //         (v) => normalizeString(v.name, '-') === normalizeString(valueName, '-', languageCode),
  //       )
  //       if (existing) {
  //         facetValueEntity = existing
  //       } else {
  //         facetValueEntity = await this.facetValueService.create(ctx, facetEntity, {
  //           code: normalizeString(valueName, '-', languageCode),
  //           translations: item.translations.map((translation) => {
  //             return {
  //               languageCode: translation.languageCode,
  //               name: translation.value,
  //             }
  //           }),
  //         })
  //       }
  //       this.facetValueMap.set(facetValueMapKey, facetValueEntity)
  //     }
  //     facetValueIds.push(facetValueEntity.id)
  //   }

  //   return facetValueIds
  // }

  /**
   * Normalizes CSV-style JSON (single quotes, spacing) before JSON.parse, consistent with other custom-field parsing in this importer.
   */
  private normalizeCustomFieldJsonInput(raw: string): string {
    return raw.replace(/'/g, '"').replace(/\s+/g, ' ').replace(/,\s*'/g, ", '")
  }

  /**
   * Coerces raw JSON object properties to the scalar types declared on a struct custom field.
   */
  private coerceStructRow(
    structDef: StructCustomFieldConfig,
    parsed: Record<string, unknown>,
    parseBooleanFn: (input?: string) => boolean,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const subField of structDef.fields) {
      if (!Object.prototype.hasOwnProperty.call(parsed, subField.name)) {
        continue
      }
      const raw = parsed[subField.name]
      if (raw === null || raw === undefined) {
        continue
      }
      switch (subField.type) {
        case 'string':
        case 'text':
          out[subField.name] = String(raw)
          break
        case 'int': {
          const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
          if (!Number.isNaN(n)) {
            out[subField.name] = n
          }
          break
        }
        case 'float': {
          const n = typeof raw === 'number' ? raw : parseFloat(String(raw))
          if (!Number.isNaN(n)) {
            out[subField.name] = n
          }
          break
        }
        case 'boolean':
          out[subField.name] = typeof raw === 'boolean' ? raw : parseBooleanFn(String(raw))
          break
        case 'datetime':
          out[subField.name] = String(raw)
          break
      }
    }
    return out
  }

  /** Swaps lookup values for ids; `RelationLookupResolver` has already checked each value. */
  private idsForLookupValues(
    idsByLookup: Map<string, ID>,
    lookup: RelationLookup,
    value: string,
    list: boolean,
  ): string | string[] {
    const idFor = (lookupValue: string): string => {
      const id = idsByLookup.get(relationLookupKey(lookup, lookupValue))
      if (id === undefined) {
        throw new InternalServerError(
          `No ${lookup.entityName} with ${lookup.column} ${lookupValue}`,
        )
      }
      return String(id)
    }
    if (!list) {
      return idFor(value.trim())
    }
    return splitLookupList(value).map(idFor)
  }

  private isValidRelationIdentifier(value: string): boolean {
    return /^[A-Za-z0-9_-]+$/.test(value)
  }

  private async processCustomFieldValues(
    customFields: { [field: string]: string },
    config: CustomFieldConfig[],
    ctx: RequestContext,
    owner: 'product' | 'variant',
    relationLookups: RelationLookups = NO_RELATION_LOOKUPS,
  ) {
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

    const processed: {
      [field: string]:
        | string
        | string[]
        | boolean
        | undefined
        | Record<string, unknown>
        | Record<string, unknown>[]
    } = {}

    for (const fieldDef of config) {
      let foundCustomFieldType = find(
        this.customFieldTypes,
        (_type, key) => key.split(':')[1] === fieldDef.name,
      )

      if (!foundCustomFieldType) {
        // Check if the custom field is an asset
        if ((fieldDef as RelationCustomFieldConfig).entity === Asset) {
          foundCustomFieldType = 'asset'
        }
      }

      const value = customFields[fieldDef.name]

      if (!value || value.trim() === '') {
        if (fieldDef.type === 'relation' && fieldDef.nullable === false) {
          throw new InternalServerError(
            `Required relation custom field "${fieldDef.name}" is missing or empty`,
          )
        }
        continue
      }

      if (fieldDef.type === 'struct') {
        const structDef = fieldDef as StructCustomFieldConfig
        try {
          if (fieldDef.list === true) {
            const trimmed = value.trim()
            if (trimmed.startsWith('[')) {
              const parsedList = JSON.parse(this.normalizeCustomFieldJsonInput(trimmed))
              if (!Array.isArray(parsedList)) {
                throw new Error('Struct list must be a JSON array')
              }
              processed[fieldDef.name] = parsedList.map((item, index) => {
                if (item === null || typeof item !== 'object' || Array.isArray(item)) {
                  throw new Error(`Invalid struct element at index ${index}`)
                }
                return this.coerceStructRow(
                  structDef,
                  item as Record<string, unknown>,
                  parseBoolean,
                )
              })
            } else {
              processed[fieldDef.name] = value
                .split('|')
                .map((part) => part.trim())
                .filter((part) => part !== '')
                .map((part) => {
                  const obj = JSON.parse(this.normalizeCustomFieldJsonInput(part))
                  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
                    throw new Error('Each pipe segment must be a JSON object')
                  }
                  return this.coerceStructRow(
                    structDef,
                    obj as Record<string, unknown>,
                    parseBoolean,
                  )
                })
            }
          } else {
            const obj = JSON.parse(this.normalizeCustomFieldJsonInput(value.trim()))
            if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
              throw new Error('Struct must be a JSON object')
            }
            processed[fieldDef.name] = this.coerceStructRow(
              structDef,
              obj as Record<string, unknown>,
              parseBoolean,
            )
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e)
          Logger.warn(
            `Skipping custom field "${fieldDef.name}" (struct): ${message}`,
            'ProductImporter',
          )
        }
        continue
      }

      if (fieldDef.type === 'relation') {
        const inputKey = getGraphQlInputName(fieldDef)
        const relDef = fieldDef as RelationCustomFieldConfig
        const lookup = relationLookups.fields.get(`${owner}:${fieldDef.name}`)
        if (lookup) {
          const ids = this.idsForLookupValues(
            relationLookups.idsByLookup,
            lookup,
            value,
            fieldDef.list === true,
          )
          if (relDef.nullable === false && Array.isArray(ids) && ids.length === 0) {
            throw new InternalServerError(
              `Required relation custom field "${fieldDef.name}" is missing or empty`,
            )
          }
          processed[inputKey] = ids
          continue
        }

        if (relDef.entity === Asset) {
          let resolvedAssetRelation: string | string[] | undefined
          if (startsWith(value, '{') || startsWith(value, '[')) {
            if (typeof value === 'string') {
              const assetValue: JsonAsset | JsonAsset[] = JSON.parse(
                value.replace(/'/g, '"').replace(/\s+/g, ' ').replace(/,\s*'/g, ", '"),
              )

              if (Array.isArray(assetValue)) {
                const createdIds: string[] = []
                for (const asset of assetValue) {
                  if (asset.url.startsWith('http://') || asset.url.startsWith('https://')) {
                    const createdAssets = await this.assetImporter.getAssets([asset], ctx)
                    const newId = createdAssets.assets[0]?.id
                    if (newId) {
                      createdIds.push(newId as string)
                    }
                  }
                  const foundAsset = asset.id ? this.allAssetsById.get(asset.id) : undefined
                  if (foundAsset && asset.name && foundAsset.name !== asset.name) {
                    await this.assetService.update(ctx, {
                      id: foundAsset.id,
                      name: asset.name,
                    })
                    foundAsset.name = asset.name as Asset['name']
                  }
                }
                resolvedAssetRelation = fieldDef.list ? createdIds : createdIds[0]
                processed[inputKey] = resolvedAssetRelation
              } else {
                if (assetValue.url.startsWith('http://') || assetValue.url.startsWith('https://')) {
                  const createdAssets = await this.assetImporter.getAssets([assetValue], ctx)
                  resolvedAssetRelation = createdAssets.assets[0]?.id as string
                  processed[inputKey] = resolvedAssetRelation
                }

                const foundAsset = assetValue.id ? this.allAssetsById.get(assetValue.id) : undefined
                if (foundAsset && assetValue.name && foundAsset.name !== assetValue.name) {
                  await this.assetService.update(ctx, {
                    id: foundAsset.id,
                    name: assetValue.name,
                  })
                  foundAsset.name = assetValue.name as Asset['name']
                }
              }
            }
          } else {
            if (value.startsWith('http://') || value.startsWith('https://')) {
              const createdAssets = await this.assetImporter.getAssets([{ url: value }], ctx)
              resolvedAssetRelation = createdAssets.assets[0]?.id as string
              processed[inputKey] = resolvedAssetRelation
            }
          }
          if (
            relDef.nullable === false &&
            (resolvedAssetRelation == null ||
              (Array.isArray(resolvedAssetRelation) && resolvedAssetRelation.length === 0))
          ) {
            throw new InternalServerError(
              `Required relation custom field "${fieldDef.name}" must contain valid asset data`,
            )
          }
          continue
        }

        if (fieldDef.list === true) {
          const relationIds = value
            .split('|')
            .map((val) => val.trim())
            .filter((val) => val !== '')
          if (
            relationIds.some(
              (id) =>
                id.startsWith('http://') ||
                id.startsWith('https://') ||
                startsWith(id, '{') ||
                startsWith(id, '[') ||
                !this.isValidRelationIdentifier(id),
            )
          ) {
            throw new InternalServerError(
              `Relation custom field "${fieldDef.name}" must contain valid relation IDs`,
            )
          }
          if (relDef.nullable === false && relationIds.length === 0) {
            throw new InternalServerError(
              `Required relation custom field "${fieldDef.name}" is missing or empty`,
            )
          }
          processed[inputKey] = relationIds
        } else {
          const relationId = value.trim()
          const validRelationId =
            relationId !== '' &&
            !relationId.startsWith('http://') &&
            !relationId.startsWith('https://') &&
            !startsWith(relationId, '{') &&
            !startsWith(relationId, '[') &&
            this.isValidRelationIdentifier(relationId)
          if (!validRelationId) {
            throw new InternalServerError(
              `Relation custom field "${fieldDef.name}" must contain a valid relation ID`,
            )
          }
          processed[inputKey] = relationId
        }
        continue
      }

      if (fieldDef.list === true) {
        processed[fieldDef.name] = value?.split('|').filter((val) => val.trim() !== '')
      } else if (fieldDef.type === 'boolean') {
        processed[fieldDef.name] = parseBoolean(value)
      } else {
        if (startsWith(value, '{') || startsWith(value, '[')) {
          if (typeof value === 'string') {
            processed[fieldDef.name] = value.replace(/'/g, '"').replace(/\s+/g, ' ')
          } else {
            processed[fieldDef.name] = JSON.stringify(value)
              .replace(/'/g, '"')
              .replace(/\s+/g, ' ')
              .replace(/,\s*'/g, ", '")
          }
        } else {
          processed[fieldDef.name] = value ? value : undefined
        }
      }
    }

    return processed
  }

  /**
   * Attempts to match a TaxCategory entity against the name supplied in the import table. If no matches
   * are found, the first TaxCategory id is returned.
   */
  private getMatchingTaxCategoryId(name: string | undefined, taxCategories: TaxCategory[]): ID {
    // When no name is provided (e.g. a new variant imported without a `taxCategory` column),
    // fall back to the default tax category, or the first one available.
    if (name == null || name.trim() === '') {
      const fallback = taxCategories.find((tc) => tc.isDefault) ?? taxCategories[0]
      if (!fallback) {
        throw new InternalServerError('No TaxCategory found')
      }
      return fallback.id
    }

    if (this.taxCategoryMatches[name]) {
      return this.taxCategoryMatches[name]
    }

    const regex = new RegExp(name, 'i')
    const found = taxCategories.find((tc) => !!tc.name.match(regex))
    const match = found ? found : taxCategories[0]
    if (!match) {
      throw new InternalServerError(`No TaxCategory found for name '${name}'`)
    }
    this.taxCategoryMatches[name] = match.id
    return match.id
  }

  private getTranslationByCodeOrFirst<Type extends { languageCode: LanguageCode }>(
    translations: Type[],
    languageCode: LanguageCode,
  ): Type {
    let translation = translations.find((t) => t.languageCode === languageCode)
    if (!translation) {
      translation = translations[0]
    }
    return translation
  }

  /**
   * Performs a first-pass analysis of all parsed products to identify option groups
   * that should be shared. Only groups with an explicit code (from the `name:code`
   * CSV syntax) are shared. Groups without a code remain product-scoped.
   *
   * For each shared code we either reuse an existing ProductOptionGroup with that
   * code in the current channel, or create a new one (and its options) up-front so
   * the per-product loop can simply attach it.
   */
  private async buildSharedOptionGroupMap(
    ctx: RequestContext,
    rows: ParsedProductWithId[],
  ): Promise<Map<string, { groupId: ID; optionIds: Map<string, ID> }>> {
    const sharedGroupMap = new Map<string, { groupId: ID; optionIds: Map<string, ID> }>()

    type ParsedOptionGroup = (typeof rows)[number]['product']['optionGroups'][number]
    type OptionTranslation = { languageCode: LanguageCode; name: string }
    // A shared group gets every value any product in the file uses, in order of first use.
    // The group's name comes from the first product that declares the code.
    const codeEntries = new Map<
      string,
      { optionGroup: ParsedOptionGroup; values: Map<string, OptionTranslation[]> }
    >()
    for (const { product } of rows) {
      for (const optionGroup of product.optionGroups) {
        if (!optionGroup.code) {
          continue
        }
        const entry = codeEntries.get(optionGroup.code) ?? { optionGroup, values: new Map() }
        codeEntries.set(optionGroup.code, entry)
        const mainTranslation = this.getTranslationByCodeOrFirst(
          optionGroup.translations,
          ctx.languageCode,
        )
        mainTranslation.values.forEach((value, index) => {
          if (entry.values.has(value)) {
            return
          }
          entry.values.set(
            value,
            optionGroup.translations
              .map((translation) => ({
                languageCode: translation.languageCode,
                name: translation.values[index],
              }))
              .filter((t) => t.name),
          )
        })
      }
    }

    for (const [code, { optionGroup, values }] of codeEntries) {
      const groupTranslations = optionGroup.translations
        .map((translation) => ({
          languageCode: translation.languageCode,
          name: translation.name,
        }))
        .filter((t) => t.name)

      const existingGroup = await this.connection.getRepository(ctx, ProductOptionGroup).findOne({
        relations: ['channels'],
        where: {
          code,
          channels: {
            id: ctx.channelId,
          },
        },
      })

      // The fast importer ignores `options` here; the loop below upserts each option.
      const groupId = existingGroup
        ? await this.fastImporter.updateProductOptionGroup({
            id: existingGroup.id,
            code,
            options: [],
            translations: groupTranslations,
          })
        : await this.fastImporter.createProductOptionGroup({
            code,
            options: [],
            translations: groupTranslations,
          })

      const optionIds = new Map<string, ID>()
      for (const [value, translations] of values) {
        const optionCode = await this.slugStrategy.generate(ctx, {
          value,
          entityName: 'ProductOption',
          fieldName: 'code',
        })
        const createdOptionId = await this.fastImporter.createProductOption({
          productOptionGroupId: groupId,
          code: optionCode,
          translations,
        })
        optionIds.set(value, createdOptionId)
      }

      sharedGroupMap.set(code, { groupId, optionIds })
    }

    return sharedGroupMap
  }

  async createFacetAndValue(facet: ParsedFacet, facetCode: string, valueCode: string) {
    const facetValueCacheKey = `${facetCode}::${valueCode}`
    const cachedFacetValueId = this.facetValueIdCache.get(facetValueCacheKey)
    if (cachedFacetValueId) {
      return cachedFacetValueId
    }

    const facetId =
      this.facetIdCache.get(facetCode) ??
      (await this.fastImporter.createFacet({
        code: facetCode,
        isPrivate: false,
        translations: facet.translations.map((translation) => {
          return {
            languageCode: translation.languageCode,
            name: translation.facet,
            value: translation.value,
          }
        }),
      }))
    this.facetIdCache.set(facetCode, facetId)

    const facetValueId = await this.fastImporter.createFacetValue({
      facetId,
      code: valueCode,
      translations: facet.translations.map((translation) => {
        return {
          languageCode: translation.languageCode,
          name: translation.value,
        }
      }),
    })

    this.facetValueIdCache.set(facetValueCacheKey, facetValueId)
    return facetValueId
  }

  /**
   * Resolves the assets of an `assets` or `variantAssets` cell, in cell order. A URL goes through
   * the asset importer. Any other value names an existing asset the way the export writes it: by
   * the `id` of the JSON format or by its `source`. An existing asset is linked as it is, never
   * uploaded again, and a value that matches no asset is reported.
   */
  private async resolveAssets(
    assetPaths: string[],
    assetsJson: JsonAsset[] | undefined,
    ctx?: RequestContext,
  ): Promise<{ assets: Asset[]; errors: string[] }> {
    const assets: Asset[] = []
    const errors: string[] = []
    for (const [idx, assetPath] of assetPaths.entries()) {
      const assetID = assetsJson?.[idx]?.id
      const knownAsset = assetID ? this.allAssetsById.get(assetID) : undefined
      if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) {
        const imported = await this.assetImporter.getAssets(
          [{ url: assetPath, name: assetsJson?.[idx]?.name || undefined, id: knownAsset?.id }],
          ctx,
        )
        assets.push(...imported.assets)
        errors.push(...imported.errors)
        continue
      }
      const existingAsset = knownAsset ?? this.allAssetsBySource.get(assetPath)
      if (existingAsset) {
        assets.push(existingAsset)
      } else {
        errors.push(`Could not find an existing asset with source "${assetPath}"`)
      }
    }
    return { assets, errors }
  }

  private resolveFeaturedAssetId(
    importedAssets: Asset[],
    existingFeaturedAsset: Asset | undefined | null,
    updatingStrategy: UpdatingStrategy,
  ): ID | undefined {
    const firstFeaturedCandidate =
      importedAssets.find((a) => a.type === AssetType.IMAGE) ?? importedAssets[0]

    if (importedAssets.length > 0 && firstFeaturedCandidate) {
      if (updatingStrategy === 'replace' || !existingFeaturedAsset) {
        return firstFeaturedCandidate.id
      }
      if (existingFeaturedAsset.type === AssetType.IMAGE) {
        return existingFeaturedAsset.id
      }
      return firstFeaturedCandidate.id
    }

    if (existingFeaturedAsset?.type === AssetType.IMAGE) {
      return existingFeaturedAsset.id
    }

    return undefined
  }

  async getProductByIdWithRelations(
    ctx: RequestContext,
    id?: ID,
    withDeleted = true,
  ): Promise<Product | undefined> {
    if (!id) {
      return undefined
    }

    const product =
      (await this.connection.getRepository(ctx, Product).findOne({
        where: { id },
        withDeleted,
        relations: ['featuredAsset'],
      })) ?? undefined

    if (product) {
      const [facetValues, optionGroups, variants, assets, featuredAsset] = await Promise.all([
        this.connection
          .getRepository(ctx, FacetValue)
          .find({ where: { products: { id: product.id } }, relations: ['facet'] }),
        this.connection
          .getRepository(ctx, ProductOptionGroup)
          .find({ where: { products: { id: product.id } }, relations: ['options'] }),
        this.connection
          .getRepository(ctx, ProductVariant)
          .find({ where: { product: { id: product.id } }, relations: ['facetValues'] }),
        this.connection.getRepository(ctx, ProductAsset).find({ where: { productId: product.id } }),
        this.connection
          .getRepository(ctx, Asset)
          .findOne({ where: { id: product.featuredAsset?.id } }),
      ])

      product.facetValues = facetValues
      product.optionGroups = optionGroups
      product.variants = variants
      product.assets = assets
      if (featuredAsset) {
        product.featuredAsset = featuredAsset
      }
    }

    return product
  }
}
