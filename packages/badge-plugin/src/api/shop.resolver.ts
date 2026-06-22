import { Args, Query, Resolver, ResolveField, Parent } from '@nestjs/graphql'
import { Ctx, Logger, PaginatedList, Product, ProductVariant, RequestContext } from '@vendure/core'
import { BadgeService } from '../service/badge.service'
import { Badge } from '../entity/badge.entity'
import { PLUGIN_INIT_OPTIONS } from '../constants'
import { Inject } from '@nestjs/common'
import { BadgePluginOptions } from '../badge.plugin'
import { SearchResult } from '@vendure/common/lib/generated-shop-types'

@Resolver('Product')
export class ProductEntityResolver {
  constructor(
    @Inject(PLUGIN_INIT_OPTIONS) private config: BadgePluginOptions,
    private badgeService: BadgeService,
  ) {}

  @ResolveField()
  async badges(@Ctx() ctx: RequestContext, @Parent() product: Product) {
    return this.badgeService.findBadgesForProduct(ctx, product)
  }
}

@Resolver('SearchResult')
export class SearchResultEntityResolver {
  constructor(
    @Inject(PLUGIN_INIT_OPTIONS) private config: BadgePluginOptions,
    private badgeService: BadgeService,
  ) {}

  @ResolveField()
  async badges(@Ctx() ctx: RequestContext, @Parent() searchResult: SearchResult) {
    return this.badgeService.findBadgesForSearchResult(ctx, searchResult)
  }
}

@Resolver('ProductVariant')
export class ProductVariantEntityResolver {
  constructor(
    @Inject(PLUGIN_INIT_OPTIONS) private config: BadgePluginOptions,
    private badgeService: BadgeService,
  ) {}

  @ResolveField()
  async badges(@Ctx() ctx: RequestContext, @Parent() productVariant: ProductVariant) {
    const collectionIds = productVariant.collections.map((c) => c.id) as string[]
    return this.badgeService.findByCollectionIds(ctx, collectionIds)
  }
}

@Resolver()
export class BadgeShopResolver {
  constructor(
    @Inject(PLUGIN_INIT_OPTIONS) private config: BadgePluginOptions,
    private badgeService: BadgeService,
  ) {}

  @Query()
  async badges(@Ctx() ctx: RequestContext, @Args() args: any): Promise<PaginatedList<Badge>> {
    return this.badgeService.findAll(ctx, args.options || undefined)
  }

  @Query()
  async getBadgeFromCollection(
    @Ctx() ctx: RequestContext,
    @Args() args: { collectionId: string },
  ): Promise<Badge | null> {
    return this.badgeService.findOneByCollectionId(ctx, args.collectionId)
  }

  @Query()
  async getBadgesFromCollections(
    @Ctx() ctx: RequestContext,
    @Args() args: { collectionIds: string[] },
  ): Promise<Badge[] | null> {
    return this.badgeService.findByCollectionIds(ctx, args.collectionIds)
  }
}
