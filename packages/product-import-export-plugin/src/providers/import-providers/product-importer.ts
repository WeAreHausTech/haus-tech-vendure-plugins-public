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
  Channel,
} from '@vendure/core'
import { Stream } from 'stream'
import { Observable } from 'rxjs'
import { getGraphQlInputName } from '@vendure/common/lib/shared-utils'
import { ImportInfo } from '@vendure/common/lib/generated-types'
import { AssetType } from '@vendure/common/lib/generated-types'
import { ExtendedFastImporterService } from '../../services/extended-fast-importer.service'
import { compact, find, isUndefined, startsWith } from 'lodash'
import { JsonAsset, ParsedProductWithId, UpdatingStrategy } from '../../types'
import { PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS } from '../../constants'
import { PluginInitOptions } from '../../types'
import { ImportParser } from './import-parser'
import { ExtendedAssetImporter } from './asset-importer'
import { In, IsNull } from 'typeorm'
import { generateAssetHash } from '../../helpers/generate-asset-hash'
import { createHash } from 'crypto'
import { removeUpdatedAtFields } from '../../helpers/remove-update-at-fields'

@Injectable()
export class ProductImporter {
  private taxCategoryMatches: { [name: string]: ID } = {}
  private facetMap = new Map<string, Facet>()
  private facetValueMap = new Map<string, FacetValue>()
  private customFieldTypes: Record<string, string> = {}
  private allAssets: Asset[] = []
  private allAssetsById = new Map<ID, Asset>()
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
  ) {
    this.slugStrategy = this.configService.entityOptions.slugStrategy
  }

  parseAndImport(
    input: string | Stream,
    ctx: RequestContext,
    updateProductSlug = true,
    mainLanguage: LanguageCode,
    updatingStrategy: UpdatingStrategy,
  ): Observable<ImportProgress> {
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
      ).then((value) => {
        subscriber.next({ ...value, currentProduct: 'Complete' })
        subscriber.complete()
      })
    })
  }

  private extractProductIdsFromCSV(csvString: string): (number | null)[] {
    // Split the CSV string into lines
    const lines = csvString.split('\n')

    // Initialize an array to hold the product IDs
    const productIds: (number | null)[] = []

    // Loop through each line in the CSV
    lines.forEach((line, index) => {
      if (index === 0) return // Skip header row

      const columns = line.split(',')
      const productId = columns[0].trim()

      if (productId) {
        productIds.push(parseInt(productId, 10))
      } else {
        productIds.push(null) // Push null or undefined if productId is missing
      }
    })

    return productIds
  }

  private preprocessCsv(
    input: string,
    updateProductSlug: boolean,
  ): {
    cleanedCsv: string
    customFieldTypes: Record<string, string>
  } {
    const customFieldTypes: Record<string, string> = {}

    const lines = input.split('\n')

    // Filter out empty lines (lines that are either blank or just commas)
    const filteredLines = lines.filter((line) => {
      const trimmed = line.trim()
      return trimmed !== '' && !/^,+$/.test(trimmed) // Keep lines that are not empty or comma-only
    })

    const splitLines = (text: string): string[] => {
      // Split text by commas, but not if comma is inside double quotes
      const splittedText = text.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)

      return splittedText
    }

    const headers = splitLines(filteredLines[0]) // Use splitCsvLine to split headers correctly

    const cleanedHeaders = headers.map((header) => {
      if (header.startsWith('product:') || header.startsWith('variant:')) {
        const parts = header.split(':')
        if (parts.length === 3) {
          const [prefix, fieldName, type] = parts
          const fullFieldName = `${prefix}:${fieldName}`
          customFieldTypes[fullFieldName] = type.trim()
          return fullFieldName
        }
      }
      return header
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
          const columns = splitLines(line) // Use splitCsvLine to split the data line correctly
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
  }

  private async doParseAndImport(
    input: string | Stream,
    updateProductSlug: boolean,
    mainLanguage: LanguageCode,
    updatingStrategy: UpdatingStrategy,
    reqCtx: RequestContext,
    onProgress: OnProgressFn,
  ): Promise<ImportInfo> {
    // Per-import caches to avoid stale cross-job state.
    this.facetIdCache.clear()
    this.facetValueIdCache.clear()

    const ctx = await this.getRequestContext(reqCtx, mainLanguage)
    await this.setMissingAssetHashes(ctx)

    let csvContent: string

    if (typeof input === 'string') {
      csvContent = input
    } else {
      // If input is a Stream, you need to read it fully into memory
      csvContent = await this.streamToString(input)
    }

    // Preprocess the CSV to extract types and clean headers
    const { cleanedCsv, customFieldTypes } = this.preprocessCsv(csvContent, updateProductSlug)
    this.customFieldTypes = customFieldTypes

    const parsed = (await this.importParser.parseProducts(
      cleanedCsv,
      ctx.languageCode,
    )) as ParseResult<ParsedProductWithId>

    const productIds = this.extractProductIdsFromCSV(cleanedCsv)
    parsed.results.forEach((result, index) => {
      const productId = productIds[index]
      if (productId !== null) {
        result.product.productId = productId
      }
      // Handle the case where productId is null if necessary
    })

    if (parsed && parsed.results.length) {
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
  ): Promise<string[]> {
    let errors: string[] = []
    let imported = 0
    const languageCode = ctx.languageCode
    const taxCategories = await this.taxCategoryService.findAll(ctx)

    // Create taxCategory if none exists
    if (taxCategories.totalItems === 0) {
      await this.taxCategoryService.create(ctx, {
        name: 'Standard Tax',
        isDefault: true,
      })
    }
    await this.fastImporter.initialize(ctx.channel)
    const allVariantSkus = rows
      .map((row) => row.variants.map((variant) => variant.sku))
      .reduce((acc, val) => acc.concat(val), [])

    const shouldRestore =
      this.pluginOptions?.importOptions?.defaultOptions?.restoreSoftDeleted !== false

    for (const { product, variants } of rows) {
      const productMainTranslation = this.getTranslationByCodeOrFirst(
        product.translations,
        ctx.languageCode,
      )

      const assetsToImport = compact(
        product.assetPaths.map((assetPath, idx) => {
          const assetID = product.assetsJson?.[idx]?.id
          if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) {
            return {
              url: assetPath,
              name: product.assetsJson?.[idx]?.name || undefined,
              id:
                  assetID && this.allAssetsById.get(assetID)
                  ? product.assetsJson?.[idx]?.id
                  : undefined,
            }
          }
        }),
      )

      const createProductAssets = await this.assetImporter.getAssets(assetsToImport, ctx)
      const productAssets = createProductAssets.assets

      if (createProductAssets.errors.length) {
        errors = errors.concat(createProductAssets.errors)
      }

      const customFields = await this.processCustomFieldValues(
        product.translations[0].customFields,
        this.configService.customFields.Product,
        ctx,
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

      const getFeaturedAssetId = (product?: Product) => {
        if (product?.featuredAsset) {
          const assetIsImage = product.featuredAsset.type === AssetType.IMAGE
          return assetIsImage ? product.featuredAsset.id : undefined
        }
        const firstAsset = productAssets.find((a) => a.type === AssetType.IMAGE)
        return firstAsset ? firstAsset.id : undefined
      }

      const productData = {
        featuredAssetId: getFeaturedAssetId(existingProduct),
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
          const code = await this.slugStrategy.generate(ctx, {
            value: `${productMainTranslation.name}-${optionGroupMainTranslation.name}`,
            entityName: 'ProductOptionGroup',
            fieldName: 'code',
          })
          const previousCode = await this.slugStrategy.generate(ctx, {
            value: `${productNameHasChanged?.previousName}-${optionGroupMainTranslation.name}`,
            entityName: 'ProductOptionGroup',
            fieldName: 'code',
          })
          const foundOptionGroup = productOptionsGroups.find((group) => group.code === previousCode)

          const groupId = foundOptionGroup
            ? await this.fastImporter.updateProductOptionGroup({
                id: foundOptionGroup.id,
                code,
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
                code,
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
              productOptionGroupId: groupId,
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
          await this.fastImporter.addOptionGroupToProduct(createdProductId, groupId)
        }
      }

      for (const variant of variants) {
        const variantMainTranslation = this.getTranslationByCodeOrFirst(
          variant.translations,
          ctx.languageCode,
        )

        const assetsToImport = compact(
          variant.assetPaths.map((assetPath, idx) => {
            const assetID = variant.assetsJson?.[idx]?.id
            if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) {
              return {
                url: assetPath,
                name: variant.assetsJson?.[idx]?.name || undefined,
                id:
                  assetID && this.allAssetsById.get(assetID)
                    ? variant.assetsJson?.[idx]?.id
                    : undefined,
              }
            }
          }),
        )

        const createVariantAssets = await this.assetImporter.getAssets(assetsToImport)
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

        const getFeaturedAssetId = (variant?: ProductVariant | null) => {
          if (variant?.featuredAsset) {
            const assetIsImage = variant.featuredAsset.type === AssetType.IMAGE
            return assetIsImage ? variant.featuredAsset.id : undefined
          }
          const firstAsset = variantAssets.find((a) => a.type === AssetType.IMAGE)
          return firstAsset ? firstAsset.id : undefined
        }

        const variantData = {
          productId: createdProductId,
          facetValueIds: updatingStrategy === 'replace' ? [] : undefined,
          featuredAssetId: getFeaturedAssetId(existingVariant),
          assetIds: variantAssets.map((a) => a.id),
          sku: variant.sku,
          ...(variant.taxCategory !== undefined
            ? { taxCategoryId: this.getMatchingTaxCategoryId(variant.taxCategory, taxCategories.items) }
            : {}),
          ...(variant.stockOnHand !== undefined ? { stockOnHand: variant.stockOnHand } : {}),
          ...(variant.trackInventory !== undefined ? { trackInventory: variant.trackInventory } : {}),
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

  private isValidRelationIdentifier(value: string): boolean {
    return /^[A-Za-z0-9_-]+$/.test(value)
  }

  private async processCustomFieldValues(
    customFields: { [field: string]: string },
    config: CustomFieldConfig[],
    ctx?: RequestContext,
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
                  if (foundAsset && foundAsset.name !== asset.name) {
                    await this.connection.getRepository(ctx, Asset).update(foundAsset.id, {
                      name: asset.name,
                    })
                    foundAsset.name = asset.name || foundAsset.name
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
                if (foundAsset && foundAsset.name !== assetValue.name) {
                  await this.connection.getRepository(ctx, Asset).update(foundAsset.id, {
                    name: assetValue.name,
                  })
                  foundAsset.name = assetValue.name || foundAsset.name
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
  private getMatchingTaxCategoryId(name: string, taxCategories: TaxCategory[]): ID {
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
          .find({ where: { product: { id: product.id } }, relations: ['options'] }),
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
