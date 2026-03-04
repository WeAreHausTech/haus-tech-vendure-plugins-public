import { Injectable } from '@nestjs/common'
import {
  Channel,
  ChannelService,
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
  StockMovementService,
  TransactionalConnection,
  TranslatableSaver,
  TranslatedInput,
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

@Injectable()
export class ExtendedFastImporterService {
  private defaultChannel: Channel
  private importCtx: RequestContext

  /** @internal */
  constructor(
    private connection: TransactionalConnection,
    private channelService: ChannelService,
    private stockMovementService: StockMovementService,
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
        p.channels = unique([...p.channels, this.defaultChannel, this.importCtx.channel], 'id')
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
          p.channels = unique([this.defaultChannel, this.importCtx.channel], 'id')
          if (input.featuredAssetId) {
            p.featuredAsset = { id: input.featuredAssetId } as any
          }
        } catch (error) {
          console.log(error)
        }
      },
    })
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
      beforeSave: (group) => {
        group.deletedAt = null
      },
    })
    return group.id
  }

  async createProductOptionGroup(input: CreateProductOptionGroupInput): Promise<ID> {
    this.ensureInitialized()
    const groupExists = await this.connection
      .getRepository(this.importCtx, ProductOptionGroup)
      .findOne({
        where: { code: input.code },
      })

    if (groupExists) {
      await this.translatableSaver.update({
        ctx: this.importCtx,
        input: { ...omit(input, 'options'), id: groupExists.id },
        entityType: ProductOptionGroup,
        translationType: ProductOptionGroupTranslation,
        beforeSave: (group) => {
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
    })
    return group.id
  }

  async createProductOption(input: CreateProductOptionInput): Promise<ID> {
    this.ensureInitialized()
    const optionsExist = await this.connection
      .getRepository(this.importCtx, ProductOption)
      .findOne({
        where: { code: input.code, groupId: input.productOptionGroupId },
      })

    if (optionsExist) {
      const updatedOption = await this.translatableSaver.update({
        ctx: this.importCtx,
        input: { ...input, id: optionsExist.id },
        entityType: ProductOption,
        translationType: ProductOptionTranslation,
        beforeSave: (po) => {
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
      relations: ['optionGroups', 'optionGroups.options'],
    })

    if (!product) {
      throw new Error(`Product with ID ${productId} not found`)
    }

    if (!product.optionGroups.length) {
      return
    }

    const promises = product.optionGroups.map((group) =>
      this.connection
        .getRepository(this.importCtx, ProductOptionGroup)
        .createQueryBuilder()
        .relation(ProductOptionGroup, 'options')
        .of(group.id)
        .delete(),
    )

    await Promise.all(promises)

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
          facet.channels = unique(
            [...facet.channels, this.defaultChannel, this.importCtx.channel],
            'id',
          )
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
        facet.channels = unique([this.defaultChannel, this.importCtx.channel], 'id')
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
          facetValue.channels = unique(
            [...facetValue.channels, this.defaultChannel, this.importCtx.channel],
            'id',
          )
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
        facetValue.channels = unique([this.defaultChannel, this.importCtx.channel], 'id')
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

  async updateProductVariant(input: CreateProductVariantInput & { id: ID }): Promise<ID> {
    this.ensureInitialized()
    if (!input.optionIds) {
      input.optionIds = []
    }

    const inputWithoutPrice = {
      ...input,
    }
    delete inputWithoutPrice.price

    const updatedVariant = await this.translatableSaver.update({
      ctx: this.importCtx,
      input: inputWithoutPrice,
      entityType: ProductVariant,
      translationType: ProductVariantTranslation,
      beforeSave: async (variant) => {
        await this.entityHydrator.hydrate(this.importCtx, variant, { relations: ['channels'] })
        variant.channels = unique(
          [...variant.channels, this.defaultChannel, this.importCtx.channel],
          'id',
        )
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

    if (input.assetIds) {
      const existingAssets = await this.connection
        .getRepository(this.importCtx, ProductVariantAsset)
        .find({
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
        .getRepository(this.importCtx, ProductVariantAsset)
        .save(newAssets, { reload: false })
    }

    await this.stockMovementService.adjustProductVariantStock(
      this.importCtx,
      updatedVariant.id,
      input.stockOnHand ?? 0,
    )
    const assignedChannelIds = unique([this.defaultChannel, this.importCtx.channel], 'id').map(
      (c) => c.id,
    )

    for (const channelId of assignedChannelIds) {
      const allPrices = await this.connection
        .getRepository(this.importCtx, ProductVariantPrice)
        .find({
          where: {
            variant: { id: updatedVariant.id },
          },
        })
      let existingVariantPrice = allPrices.find(
        (p) =>
          idsAreEqual(p.channelId, channelId) &&
          p.currencyCode === this.importCtx.channel.defaultCurrencyCode,
      )

      if (!existingVariantPrice) {
        const variantPrice = new ProductVariantPrice({
          price: isNumber(input.price) ? input.price : 0,
          channelId,
          currencyCode: this.importCtx.channel.defaultCurrencyCode,
        })
        variantPrice.variant = updatedVariant
        await this.connection.rawConnection
          .getRepository(ProductVariantPrice)
          .save(variantPrice, { reload: false })
      } else {
        if (isUndefined(input.price)) {
          input.price = existingVariantPrice.price
        }
        existingVariantPrice.price = input.price
        await this.connection.rawConnection
          .getRepository(ProductVariantPrice)
          .save(existingVariantPrice, { reload: false })
      }
    }

    return updatedVariant.id
  }

  async createProductVariant(input: CreateProductVariantInput): Promise<ID> {
    this.ensureInitialized()
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
      ctx: this.importCtx,
      input: inputWithoutPrice,
      entityType: ProductVariant,
      translationType: ProductVariantTranslation,
      beforeSave: async (variant) => {
        variant.channels = unique([this.defaultChannel, this.importCtx.channel], 'id')
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
        .getRepository(this.importCtx, ProductVariantAsset)
        .save(variantAssets, { reload: false })
    }
    await this.stockMovementService.adjustProductVariantStock(
      this.importCtx,
      createdVariant.id,
      input.stockOnHand ?? 0,
    )
    const assignedChannelIds = unique([this.defaultChannel, this.importCtx.channel], 'id').map(
      (c) => c.id,
    )

    for (const channelId of assignedChannelIds) {
      const variantPrice = new ProductVariantPrice({
        price: isNumber(input.price) ? input.price : 0,
        channelId,
        currencyCode: this.importCtx.channel.defaultCurrencyCode,
      })
      variantPrice.variant = createdVariant
      await this.connection.rawConnection
        .getRepository(ProductVariantPrice)
        .save(variantPrice, { reload: false })
    }

    return createdVariant.id
  }

  private ensureInitialized() {
    if (!this.defaultChannel || !this.importCtx) {
      throw new Error(
        "The FastImporterService must be initialized with a call to 'initialize()' before importing data",
      )
    }
  }
}
