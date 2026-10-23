import { Injectable } from '@nestjs/common'
import {
  Channel,
  ChannelService,
  CustomFieldRelationService,
  EntityHydrator,
  Facet,
  FacetTranslation,
  FacetValue,
  FacetValueTranslation,
  ID,
  idsAreEqual,
  Product,
  ProductAsset,
  ProductOption,
  ProductOptionGroup,
  ProductOptionGroupTranslation,
  ProductOptionTranslation,
  ProductTranslation,
  ProductVariant,
  ProductVariantAsset,
  ProductVariantPrice,
  ProductVariantTranslation,
  RequestContext,
  RequestContextService,
  Logger,
  StockLevelService,
  StockLocationService,
  TransactionalConnection,
  TranslatableSaver,
} from '@vendure/core'
import {
  CreateFacetInput,
  CreateFacetValueInput,
  CreateProductInput,
  CreateProductOptionGroupInput,
  CreateProductOptionInput,
  CreateProductVariantInput,
} from '@vendure/common/lib/generated-types'
import { normalizeString } from '../helpers/normalize-string'
import { unique } from '@vendure/common/lib/unique'
import { isNumber, isUndefined, omit, set } from 'lodash'
import { loggerCtx } from '../constants'

@Injectable()
export class ExtendedFastImporterService {
  private defaultChannel: Channel
  private importCtx: RequestContext
  private productChannels: Channel[] = []

  /** @internal */
  constructor(
    private connection: TransactionalConnection,
    private channelService: ChannelService,
    private customFieldRelationService: CustomFieldRelationService,
    private stockLevelService: StockLevelService,
    private stockLocationService: StockLocationService,
    private translatableSaver: TranslatableSaver,
    private requestContextService: RequestContextService,
    private entityHydrator: EntityHydrator,
  ) {}

  /**
   * @description
   * This should be called prior to any of the import methods, as it establishes the
   * default Channel as well as the context in which the new entities will be created.
   *
   * Passing a `channel` argument means that Products and ProductVariants will be assigned
   * to that Channel.
   */
  async initialize(channel?: Channel) {
    this.productChannels = []
    this.importCtx = channel
      ? await this.requestContextService.create({
          apiType: 'admin',
          channelOrToken: channel,
        })
      : RequestContext.empty()
    this.defaultChannel = await this.channelService.getDefaultChannel(this.importCtx)
  }

  async updateProduct(id: ID, input: CreateProductInput & { id: ID }): Promise<ID> {
    this.ensureInitialized()
    input.translations?.map((translation) => {
      translation.slug = normalizeString(translation.slug as string, '-', translation.languageCode)
    })

    const product = await this.translatableSaver.update({
      ctx: this.importCtx,
      input,
      entityType: Product,
      translationType: ProductTranslation,
      beforeSave: async (p) => {
        await this.entityHydrator.hydrate(this.importCtx, p, { relations: ['channels'] })
        p.channels = unique([...p.channels, ...this.assignedChannels()], 'id')
        if (input.facetValueIds) {
          p.facetValues = input.facetValueIds.map((id) => ({ id }) as any)
        }

        if (input.featuredAssetId) {
          p.featuredAsset = { id: input.featuredAssetId } as any
        } else {
          set(p, 'featuredAssetId', null)
        }
      },
    })

    await this.customFieldRelationService.updateRelations(this.importCtx, Product, input, product)

    if (input.assetIds) {
      const existingAssets = await this.connection
        .getRepository(this.importCtx, ProductAsset)
        .find({
          where: { productId: id },
        })

      const newAssets = input.assetIds
        .filter((id) => !existingAssets.some((asset) => asset.assetId === id))
        .map((id, i) => new ProductAsset({ assetId: id, productId: product.id, position: i }))

      await this.connection
        .getRepository(this.importCtx, ProductAsset)
        .save(newAssets, { reload: false })
    }

    return product.id
  }

  async removeAllAssetsFromProduct(product: Product) {
    this.ensureInitialized()
    await this.connection
      .getRepository(this.importCtx, ProductAsset)
      .delete({ productId: product.id })
    product.featuredAsset = undefined as any
  }

  async removeAllAssetsFromVariant(variant: ProductVariant) {
    this.ensureInitialized()
    await this.connection
      .getRepository(this.importCtx, ProductVariantAsset)
      .delete({ productVariantId: variant.id })
    variant.featuredAsset = undefined as any
  }

  async createProduct(input: CreateProductInput): Promise<ID> {
    this.ensureInitialized()
    // https://github.com/vendure-ecommerce/vendure/issues/2053
    // normalizes slug without validation for faster performance
    input.translations.map((translation) => {
      translation.slug = normalizeString(translation.slug as string, '-', translation.languageCode)
    })
    const product = await this.translatableSaver.create({
      ctx: this.importCtx,
      input,
      entityType: Product,
      translationType: ProductTranslation,
      beforeSave: async (p) => {
        try {
          p.channels = this.assignedChannels()
          if (input.featuredAssetId) {
            p.featuredAsset = { id: input.featuredAssetId } as any
          }
        } catch (error) {
          Logger.error('Failed to prepare product before save', loggerCtx, (error as Error).stack)
        }
      },
    })

    await this.customFieldRelationService.updateRelations(this.importCtx, Product, input, product)

    if (input.assetIds) {
      const productAssets = input.assetIds.map(
        (id, i) =>
          new ProductAsset({
            assetId: id,
            productId: product.id,
            position: i,
          }),
      )
      await this.connection
        .getRepository(this.importCtx, ProductAsset)
        .save(productAssets, { reload: false })
    }
    return product.id
  }

  async updateProductOptionGroup(input: CreateProductOptionGroupInput & { id: ID }): Promise<ID> {
    this.ensureInitialized()
    const group = await this.translatableSaver.update({
      ctx: this.importCtx,
      input: { ...omit(input, 'options') },
      entityType: ProductOptionGroup,
      translationType: ProductOptionGroupTranslation,
      beforeSave: async (group) => {
        await this.entityHydrator.hydrate(this.importCtx, group, { relations: ['channels'] })
        group.channels = unique([...group.channels, ...this.assignedChannels()], 'id')
        group.deletedAt = null
      },
    })
    return group.id
  }

  async createProductOptionGroup(input: CreateProductOptionGroupInput): Promise<ID> {
    this.ensureInitialized()
    const channelId = this.importCtx.channelId
    const groupExists = await this.connection
      .getRepository(this.importCtx, ProductOptionGroup)
      .findOne({
        where: channelId ? { code: input.code, channels: { id: channelId } } : { code: input.code },
        relations: ['channels'],
      })

    if (groupExists) {
      await this.translatableSaver.update({
        ctx: this.importCtx,
        input: { ...omit(input, 'options'), id: groupExists.id },
        entityType: ProductOptionGroup,
        translationType: ProductOptionGroupTranslation,
        beforeSave: async (group) => {
          await this.entityHydrator.hydrate(this.importCtx, group, { relations: ['channels'] })
          group.channels = unique([...group.channels, ...this.assignedChannels()], 'id')
          group.deletedAt = null
        },
      })
      return groupExists.id
    }

    const group = await this.translatableSaver.create({
      ctx: this.importCtx,
      input,
      entityType: ProductOptionGroup,
      translationType: ProductOptionGroupTranslation,
      beforeSave: (group) => {
        group.channels = this.assignedChannels()
      },
    })
    return group.id
  }

  async createProductOption(input: CreateProductOptionInput): Promise<ID> {
    this.ensureInitialized()
    const optionsExist = await this.connection
      .getRepository(this.importCtx, ProductOption)
      .findOne({
        where: { code: input.code, groupId: input.productOptionGroupId },
        relations: ['channels'],
      })

    if (optionsExist) {
      const updatedOption = await this.translatableSaver.update({
        ctx: this.importCtx,
        input: { ...input, id: optionsExist.id },
        entityType: ProductOption,
        translationType: ProductOptionTranslation,
        beforeSave: async (po) => {
          await this.entityHydrator.hydrate(this.importCtx, po, { relations: ['channels'] })
          po.channels = unique([...po.channels, ...this.assignedChannels()], 'id')
          po.group = { id: input.productOptionGroupId } as any
          po.deletedAt = null
        },
      })

      return updatedOption.id
    }

    const option = await this.translatableSaver.create({
      ctx: this.importCtx,
      input,
      entityType: ProductOption,
      translationType: ProductOptionTranslation,
      beforeSave: (po) => {
        po.channels = this.assignedChannels()
        po.group = { id: input.productOptionGroupId } as any
        po.deletedAt = null
      },
    })
    return option.id
  }

  async removeOptionGroupsFromProduct(productId: ID) {
    this.ensureInitialized()
    const product = await this.connection.getRepository(this.importCtx, Product).findOne({
      where: { id: productId },
      relations: ['optionGroups'],
    })

    if (!product) {
      throw new Error(`Product with ID ${productId} not found`)
    }

    if (!product.optionGroups.length) {
      return
    }

    await this.connection
      .getRepository(this.importCtx, Product)
      .createQueryBuilder()
      .relation(Product, 'optionGroups')
      .of(productId)
      .remove(product.optionGroups.map((o) => o.id))
  }

  async addOptionGroupToProduct(productId: ID, optionGroupId: ID) {
    this.ensureInitialized()

    await this.connection
      .getRepository(this.importCtx, Product)
      .createQueryBuilder()
      .relation('optionGroups')
      .of(productId)
      .add(optionGroupId)
  }

  async createFacet(input: CreateFacetInput) {
    this.ensureInitialized()
    const facetExists = await this.connection.getRepository(this.importCtx, Facet).findOne({
      where: { code: input.code },
      relations: ['channels', 'translations'],
    })

    if (facetExists) {
      const facet = await this.translatableSaver.update({
        ctx: this.importCtx,
        input: { ...input, id: facetExists.id },
        entityType: Facet,
        translationType: FacetTranslation,
        beforeSave: async (facet) => {
          await this.entityHydrator.hydrate(this.importCtx, facet, { relations: ['channels'] })
          facet.channels = unique([...facet.channels, ...this.assignedChannels()], 'id')
        },
      })

      return facet.id
    }

    const facet = await this.translatableSaver.create({
      ctx: this.importCtx,
      input,
      entityType: Facet,
      translationType: FacetTranslation,
      beforeSave: async (facet) => {
        facet.channels = this.assignedChannels()
      },
    })

    return facet.id
  }

  async createFacetValue(input: CreateFacetValueInput) {
    this.ensureInitialized()
    const facetValueExists = await this.connection
      .getRepository(this.importCtx, FacetValue)
      .findOne({
        where: { code: input.code, facet: { id: input.facetId } },
        relations: ['channels', 'translations'],
      })

    if (facetValueExists) {
      const updatedFacetValue = await this.translatableSaver.update({
        ctx: this.importCtx,
        input: { ...input, id: facetValueExists.id },
        entityType: FacetValue,
        translationType: FacetValueTranslation,
        beforeSave: async (facetValue) => {
          await this.entityHydrator.hydrate(this.importCtx, facetValue, { relations: ['channels'] })
          facetValue.facet = { id: input.facetId } as any
          facetValue.channels = unique([...facetValue.channels, ...this.assignedChannels()], 'id')
        },
      })

      return updatedFacetValue.id
    }

    const facetValue = await this.translatableSaver.create({
      ctx: this.importCtx,
      input,
      entityType: FacetValue,
      translationType: FacetValueTranslation,
      beforeSave: async (facetValue) => {
        facetValue.facet = { id: input.facetId } as any
        facetValue.channels = this.assignedChannels()
      },
    })

    return facetValue.id
  }

  async addFacetValueToProduct(productId: ID, facetValueId: ID): Promise<void> {
    this.ensureInitialized()

    const existingRelation = await this.connection
      .getRepository(this.importCtx, Product)
      .createQueryBuilder()
      .relation(Product, 'facetValues')
      .of(productId)
      .loadMany()

    if (!existingRelation.some((relation: any) => relation.id === facetValueId)) {
      await this.connection
        .getRepository(this.importCtx, Product)
        .createQueryBuilder()
        .relation(Product, 'facetValues')
        .of(productId)
        .add(facetValueId)
    }
  }

  async addFacetValueToProductVariant(variantId: ID, facetValueId: ID): Promise<void> {
    this.ensureInitialized()

    const existingRelation = await this.connection
      .getRepository(this.importCtx, ProductVariant)
      .createQueryBuilder()
      .relation(ProductVariant, 'facetValues')
      .of(variantId)
      .loadMany()

    if (!existingRelation.some((relation: any) => relation.id === facetValueId)) {
      await this.connection
        .getRepository(this.importCtx, ProductVariant)
        .createQueryBuilder()
        .relation(ProductVariant, 'facetValues')
        .of(variantId)
        .add(facetValueId)
    }
  }

  /**
   * Runs in one transaction, so the variant row never shows without its prices: Vendure's
   * `ProductVariant.price` resolver throws for a variant that has no price in the channel.
   */
  async updateProductVariant(input: CreateProductVariantInput & { id: ID }): Promise<ID> {
    this.ensureInitialized()
    return this.connection.withTransaction(this.importCtx, (ctx) =>
      this.updateProductVariantInTransaction(ctx, input),
    )
  }

  private async updateProductVariantInTransaction(
    ctx: RequestContext,
    input: CreateProductVariantInput & { id: ID },
  ): Promise<ID> {
    if (!input.optionIds) {
      input.optionIds = []
    }

    const inputWithoutPrice = {
      ...input,
    }
    delete inputWithoutPrice.price

    const updatedVariant = await this.translatableSaver.update({
      ctx: ctx,
      input: inputWithoutPrice,
      entityType: ProductVariant,
      translationType: ProductVariantTranslation,
      beforeSave: async (variant) => {
        await this.entityHydrator.hydrate(ctx, variant, { relations: ['channels'] })
        variant.channels = unique([...variant.channels, ...this.assignedChannels(ctx)], 'id')
        const { optionIds } = input
        if (optionIds && optionIds.length) {
          variant.options = optionIds.map((id) => ({ id }) as any)
        }
        if (input.facetValueIds) {
          variant.facetValues = input.facetValueIds.map((id) => ({ id }) as any)
        }
        variant.product = { id: input.productId } as any
        variant.taxCategory = { id: input.taxCategoryId } as any
        if (input.featuredAssetId) {
          variant.featuredAsset = { id: input.featuredAssetId } as any
        }
      },
    })

    await this.customFieldRelationService.updateRelations(
      ctx,
      ProductVariant,
      input,
      updatedVariant,
    )

    if (input.assetIds) {
      const existingAssets = await this.connection.getRepository(ctx, ProductVariantAsset).find({
        where: { productVariantId: input.id },
      })

      const newAssets = input.assetIds
        .filter((id) => !existingAssets.some((asset) => asset.assetId === id))
        .map(
          (id, i) =>
            new ProductVariantAsset({
              assetId: id,
              productVariantId: updatedVariant.id,
              position: i,
            }),
        )

      await this.connection
        .getRepository(ctx, ProductVariantAsset)
        .save(newAssets, { reload: false })
    }

    if (input.stockOnHand !== undefined) {
      await this.setProductVariantStockOnHandDirectly(ctx, updatedVariant.id, input.stockOnHand)
    }
    for (const channel of this.assignedChannels(ctx)) {
      const channelId = channel.id
      const currencyCode = this.priceCurrency(ctx, channel)
      const allPrices = await this.connection.getRepository(ctx, ProductVariantPrice).find({
        where: {
          variant: { id: updatedVariant.id },
        },
      })
      const existingVariantPrice = allPrices.find(
        (p) => idsAreEqual(p.channelId, channelId) && p.currencyCode === currencyCode,
      )

      if (!existingVariantPrice) {
        const variantPrice = new ProductVariantPrice({
          price: isNumber(input.price) ? input.price : 0,
          channelId,
          currencyCode,
        })
        variantPrice.variant = updatedVariant
        await this.connection
          .getRepository(ctx, ProductVariantPrice)
          .save(variantPrice, { reload: false })
      } else {
        if (isUndefined(input.price)) {
          input.price = existingVariantPrice.price
        }
        existingVariantPrice.price = input.price
        await this.connection
          .getRepository(ctx, ProductVariantPrice)
          .save(existingVariantPrice, { reload: false })
      }
    }

    return updatedVariant.id
  }

  /** Runs in one transaction, for the reason given on `updateProductVariant`. */
  async createProductVariant(input: CreateProductVariantInput): Promise<ID> {
    this.ensureInitialized()
    return this.connection.withTransaction(this.importCtx, (ctx) =>
      this.createProductVariantInTransaction(ctx, input),
    )
  }

  private async createProductVariantInTransaction(
    ctx: RequestContext,
    input: CreateProductVariantInput,
  ): Promise<ID> {
    if (!input.optionIds) {
      input.optionIds = []
    }
    if (input.price == null) {
      input.price = 0
    }

    const inputWithoutPrice = {
      ...input,
    }
    delete inputWithoutPrice.price

    const createdVariant = await this.translatableSaver.create({
      ctx: ctx,
      input: inputWithoutPrice,
      entityType: ProductVariant,
      translationType: ProductVariantTranslation,
      beforeSave: async (variant) => {
        variant.channels = this.assignedChannels(ctx)
        const { optionIds } = input
        if (optionIds && optionIds.length) {
          variant.options = optionIds.map((id) => ({ id }) as any)
        }
        if (input.facetValueIds) {
          variant.facetValues = input.facetValueIds.map((id) => ({ id }) as any)
        }
        variant.product = { id: input.productId } as any
        variant.taxCategory = { id: input.taxCategoryId } as any
        if (input.featuredAssetId) {
          variant.featuredAsset = { id: input.featuredAssetId } as any
        }
      },
    })

    await this.customFieldRelationService.updateRelations(
      ctx,
      ProductVariant,
      input,
      createdVariant,
    )

    if (input.assetIds) {
      const variantAssets = input.assetIds.map(
        (id, i) =>
          new ProductVariantAsset({
            assetId: id,
            productVariantId: createdVariant.id,
            position: i,
          }),
      )
      await this.connection
        .getRepository(ctx, ProductVariantAsset)
        .save(variantAssets, { reload: false })
    }
    await this.setProductVariantStockOnHandDirectly(ctx, createdVariant.id, input.stockOnHand ?? 0)
    for (const channel of this.assignedChannels(ctx)) {
      const variantPrice = new ProductVariantPrice({
        price: isNumber(input.price) ? input.price : 0,
        channelId: channel.id,
        currencyCode: this.priceCurrency(ctx, channel),
      })
      variantPrice.variant = createdVariant
      await this.connection
        .getRepository(ctx, ProductVariantPrice)
        .save(variantPrice, { reload: false })
    }

    return createdVariant.id
  }

  /**
   * @description
   * Sets the channels the next product, its variants, option groups and facets are assigned to, on
   * top of the default channel and the import's channel: the `channels` column of the product's
   * row. Applies until it is set again, so call it once per product, with `[]` for none.
   */
  setProductChannels(channels: Channel[]) {
    this.productChannels = channels
  }

  /** The default channel, the import's channel and the current product's channels. */
  private assignedChannels(ctx: RequestContext = this.importCtx): Channel[] {
    return unique([this.defaultChannel, ctx.channel, ...this.productChannels], 'id')
  }

  /**
   * A price row in a channel of the product's own is in that channel's currency, or Vendure
   * finds no price there. The default channel's row keeps the import channel's currency, as it
   * always has.
   */
  private priceCurrency(ctx: RequestContext, channel: Channel) {
    return idsAreEqual(channel.id, this.defaultChannel.id)
      ? ctx.channel.defaultCurrencyCode
      : channel.defaultCurrencyCode
  }

  private ensureInitialized() {
    if (!this.defaultChannel || !this.importCtx) {
      throw new Error(
        "The FastImporterService must be initialized with a call to 'initialize()' before importing data",
      )
    }
  }

  private async setProductVariantStockOnHandDirectly(
    ctx: RequestContext,
    productVariantId: ID,
    targetStockOnHand: number,
  ): Promise<void> {
    const defaultStockLocation = await this.stockLocationService.defaultStockLocation(ctx)
    const stockLevel = await this.stockLevelService.getStockLevel(
      ctx,
      productVariantId,
      defaultStockLocation.id,
    )
    const delta = targetStockOnHand - stockLevel.stockOnHand
    if (delta === 0) {
      return
    }
    await this.stockLevelService.updateStockOnHandForLocation(
      ctx,
      productVariantId,
      defaultStockLocation.id,
      delta,
    )
  }
}
