import { Inject, Injectable } from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { In } from 'typeorm'
import {
  AssetService,
  ChannelService,
  Collection,
  ConfigService,
  CollectionService,
  EntityHydrator,
  EntityNotFoundError,
  ID,
  Injector,
  ListQueryBuilder,
  ListQueryOptions,
  PaginatedList,
  Product,
  ProductVariant,
  Promotion,
  PromotionService,
  RequestContext,
  RequestContextCacheService,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core'
import { Badge } from '../entity/badge.entity'
import {
  CreateBadgeInput,
  DeletionResponse,
  DeletionResult,
  UpdateBadgeInput,
} from '../gql/generated'
import { SearchResult } from '@vendure/common/lib/generated-shop-types'
import { AssignBadgesToChannelInput } from '../types'
import { PLUGIN_INIT_OPTIONS } from '../constants'
import { BadgePluginOptions } from '../badge.plugin'
import {
  buildCheckRegistry,
  evaluateConditions,
  uncheckedConditionCodes,
} from '../promotion-checks/evaluate-conditions'
import { shouldShowPromotionBadge } from './promotion-badge-rule'

const PROMOTION_BADGES_CACHE_KEY = 'badge-plugin:promotion-badges'

function compareIds(a: ID, b: ID): number {
  const numA = Number(a)
  const numB = Number(b)
  if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB
  return String(a).localeCompare(String(b))
}

function sortBadges(badges: Badge[]): Badge[] {
  return [...badges].sort((a, b) => a.order - b.order || compareIds(a.id, b.id))
}

/**
 * @description
 * CRUD and lookup operations for {@link Badge} entities: creates/updates badges with
 * their asset and collection relations, resolves the badges that apply to a given
 * product or search result, and manages channel assignment. All reads are scoped to
 * the active channel.
 *
 * @category Services
 */
@Injectable()
export class BadgeService {
  constructor(
    @Inject(PLUGIN_INIT_OPTIONS) private options: BadgePluginOptions,
    private listQueryBuilder: ListQueryBuilder,
    private connection: TransactionalConnection,
    private assetService: AssetService,
    private entityHydratorService: EntityHydrator,
    private collectionService: CollectionService,
    private channelService: ChannelService,
    private promotionService: PromotionService,
    private configService: ConfigService,
    private requestCache: RequestContextCacheService,
    moduleRef: ModuleRef,
  ) {
    this.injector = new Injector(moduleRef)
  }

  private readonly injector: Injector

  async findOne(ctx: RequestContext, id: ID): Promise<Badge | null> {
    return this.connection
      .getRepository(ctx, Badge)
      .findOne({ where: { id }, relations: ['collection', 'promotion', 'asset', 'channels'] })
  }

  async findAll(
    ctx: RequestContext,
    options?: ListQueryOptions<Badge>,
  ): Promise<PaginatedList<Badge>> {
    return this.listQueryBuilder
      .build(Badge, options, { relations: ['collection', 'promotion', 'asset', 'channels'], ctx })
      .leftJoin('badge.channels', 'channel')
      .andWhere('channel.id = :channelId', { channelId: ctx.channel.id })
      .getManyAndCount()
      .then(([items, totalItems]) => ({ items, totalItems }))
  }

  async create(ctx: RequestContext, input: CreateBadgeInput): Promise<Badge> {
    const position = input.position || 'top-left'
    this.validatePosition(position)
    // A badge must have an image. Reject early so we never persist an asset-less badge.
    const asset = await this.assetService.findOne(ctx, input.assetId)
    if (!asset) {
      throw new UserInputError(`No asset with the id "${input.assetId}" could be found`)
    }
    this.assertNotBoth(input.collectionId, input.promotionId)
    const badge = new Badge({ position, text: input.text ?? undefined })
    // `asset` and `collection` each share their FK column with the relation. On save()
    // TypeORM takes the FK from the relation *object*, so a scalar-only id is discarded
    // (written NULL on Postgres). Assign the loaded relation so the FK actually persists.
    badge.asset = asset
    badge.assetId = asset.id
    if (input.collectionId) {
      const collection = await this.collectionService.findOne(ctx, input.collectionId)
      if (!collection) {
        throw new UserInputError(`No collection with the id "${input.collectionId}" could be found`)
      }
      badge.collection = collection as Collection
      badge.collectionId = collection.id
    } else {
      badge.collection = null
      badge.collectionId = null
    }
    if (input.promotionId) {
      const promotion = await this.findPromotion(ctx, input.promotionId)
      badge.promotion = promotion
      badge.promotionId = promotion.id
    } else {
      badge.promotion = null
      badge.promotionId = null
    }
    const created = await this.connection.getRepository(ctx, Badge).save(badge)
    // ManyToMany channel membership isn't written from a constructor array — use the
    // channel service to persist the junction row reliably.
    await this.channelService.assignToChannels(ctx, Badge, created.id, [ctx.channelId])
    return created
  }

  async delete(ctx: RequestContext, badge: Badge): Promise<DeletionResponse> {
    try {
      await this.entityHydratorService.hydrate(ctx, badge, { relations: ['asset'] })
      const badgeAsset = badge.asset
      await this.connection.getRepository(ctx, Badge).remove(badge)
      if (badgeAsset) {
        await this.assetService.delete(ctx, [badgeAsset.id])
      }
      return { result: DeletionResult.DELETED }
    } catch (e) {
      return {
        result: DeletionResult.NOT_DELETED,
        message: e instanceof Error ? e.message : String(e),
      }
    }
  }

  async update(ctx: RequestContext, input: UpdateBadgeInput): Promise<Badge> {
    this.validatePosition(input.position)
    const repository = this.connection.getRepository(ctx, Badge)
    const badge = await repository.findOne({ where: { id: input.id } })
    if (!badge) {
      throw new EntityNotFoundError('Badge', input.id)
    }

    // An omitted key keeps the stored value, an explicit null clears it.
    const collectionId = 'collectionId' in input ? input.collectionId : badge.collectionId
    const promotionId = 'promotionId' in input ? input.promotionId : badge.promotionId
    this.assertNotBoth(collectionId, promotionId)
    if (promotionId) {
      await this.findPromotion(ctx, promotionId)
    }

    await repository.update(input.id, {
      position: input.position ?? badge.position,
      text: input.text ?? badge.text,
      collectionId: input.collectionId,
      promotionId: 'promotionId' in input ? (input.promotionId ?? null) : undefined,
      assetId: input.assetId || badge.assetId,
    })

    const updated = await this.findOne(ctx, input.id)
    if (!updated) {
      throw new EntityNotFoundError('Badge', input.id)
    }
    return updated
  }

  async findOneByCollectionId(ctx: RequestContext, collectionId: ID): Promise<Badge | null> {
    const badge = await this.connection
      .getRepository(ctx, Badge)
      .findOne({ where: { collectionId }, relations: ['channels'] })

    if (badge?.channels.some((channel) => channel.id === ctx.channel.id)) {
      return badge
    }

    return null
  }

  async findByCollectionIds(ctx: RequestContext, collectionIds: ID[]): Promise<Badge[]> {
    if (collectionIds.length === 0) {
      return []
    }
    const badges = await this.connection
      .getRepository(ctx, Badge)
      .find({ where: { collectionId: In(collectionIds) }, relations: ['channels'] })

    return badges.filter((badge) => badge.channels.some((channel) => channel.id === ctx.channel.id))
  }

  async findBadgesForProduct(ctx: RequestContext, product: Product): Promise<Badge[]> {
    return this.findBadgesForProductId(ctx, product.id)
  }

  async findBadgesForSearchResult(
    ctx: RequestContext,
    searchResult: SearchResult,
  ): Promise<Badge[]> {
    return this.findBadgesForProductId(ctx, searchResult.productId)
  }

  async findBadgesForVariant(ctx: RequestContext, variant: ProductVariant): Promise<Badge[]> {
    if (!variant.collections) {
      await this.entityHydratorService.hydrate(ctx, variant, { relations: ['collections'] })
    }
    const collectionBadges = await this.findByCollectionIds(
      ctx,
      variant.collections.map((c) => c.id),
    )
    const promotionBadges = await this.findPromotionBadgesForProduct(ctx, variant.productId)
    return sortBadges([...collectionBadges, ...promotionBadges])
  }

  /**
   * The badges linked to an active promotion whose conditions the product satisfies.
   * Promotions with a condition that has no registered product check never match.
   */
  async findPromotionBadgesForProduct(ctx: RequestContext, productId: ID): Promise<Badge[]> {
    return this.requestCache.get(ctx, `${PROMOTION_BADGES_CACHE_KEY}:${productId}`, () =>
      this.loadPromotionBadgesForProduct(ctx, productId),
    )
  }

  private async findBadgesForProductId(ctx: RequestContext, productId: ID): Promise<Badge[]> {
    const collections = await this.collectionService.getCollectionsByProductId(ctx, productId, true)
    const collectionBadges = await this.findByCollectionIds(
      ctx,
      collections.map((c) => c.id),
    )
    const promotionBadges = await this.findPromotionBadgesForProduct(ctx, productId)
    return sortBadges([...collectionBadges, ...promotionBadges])
  }

  private async loadPromotionBadgesForProduct(
    ctx: RequestContext,
    productId: ID,
  ): Promise<Badge[]> {
    const candidates = await this.requestCache.get(ctx, PROMOTION_BADGES_CACHE_KEY, () =>
      this.loadPromotionBadgeCandidates(ctx),
    )
    if (candidates.length === 0) {
      return []
    }
    const definitions = this.configService.promotionOptions.promotionConditions ?? []
    const registry = buildCheckRegistry(this.options.promotionProductChecks)
    const now = new Date()
    const shown: Badge[] = []
    for (const { badge, promotion } of candidates) {
      const results = await evaluateConditions({
        ctx,
        injector: this.injector,
        productId,
        conditions: promotion.conditions,
        definitions,
        registry,
      })
      if (shouldShowPromotionBadge(promotion, results, now)) {
        shown.push(badge)
      }
    }
    return shown
  }

  private async loadPromotionBadgeCandidates(
    ctx: RequestContext,
  ): Promise<{ badge: Badge; promotion: Promotion }[]> {
    const promotions = await this.promotionService.getActivePromotionsInChannel(ctx)
    if (promotions.length === 0) {
      return []
    }
    const byId = new Map(promotions.map((p) => [String(p.id), p]))
    const badges = await this.connection.getRepository(ctx, Badge).find({
      where: { promotionId: In(promotions.map((p) => p.id)) },
      relations: ['channels'],
    })
    return badges
      .filter((badge) => badge.channels.some((channel) => channel.id === ctx.channel.id))
      .flatMap((badge) => {
        const promotion = byId.get(String(badge.promotionId))
        return promotion ? [{ badge, promotion }] : []
      })
  }

  async assignToChannel(ctx: RequestContext, input: AssignBadgesToChannelInput): Promise<Badge[]> {
    const badges = await this.connection.findByIdsInChannel(
      ctx,
      Badge,
      input.badgeIds,
      ctx.channelId,
      {},
    )
    await Promise.all(
      badges.map(async (badge) => {
        await this.channelService.assignToChannels(ctx, Badge, badge.id, [input.channelId])
      }),
    )

    return this.connection.findByIdsInChannel(
      ctx,
      Badge,
      badges.map((b) => b.id),
      ctx.channelId,
      {},
    )
  }

  /**
   * The condition codes of the badge's promotion that cannot be checked per product,
   * so the admin can warn that the badge may show on products the promotion ignores.
   */
  async unmatchedConditionCodes(ctx: RequestContext, badge: Badge): Promise<string[]> {
    if (!badge.promotionId) {
      return []
    }
    const promotion =
      badge.promotion ?? (await this.promotionService.findOne(ctx, badge.promotionId))
    if (!promotion) {
      return []
    }
    return uncheckedConditionCodes(
      promotion.conditions,
      this.configService.promotionOptions.promotionConditions ?? [],
      buildCheckRegistry(this.options.promotionProductChecks),
    )
  }

  private async findPromotion(ctx: RequestContext, id: ID): Promise<Promotion> {
    const promotion = await this.promotionService.findOne(ctx, id)
    if (!promotion) {
      throw new UserInputError(`No promotion with the id "${id}" could be found`)
    }
    return promotion
  }

  private assertNotBoth(collectionId?: ID | null, promotionId?: ID | null): void {
    if (collectionId && promotionId) {
      throw new UserInputError('A badge links a collection or a promotion, not both')
    }
  }

  /**
   * Guards against persisting a position that is not in the configured
   * `availablePositions` list, so the stored value always matches what the
   * storefront/admin knows how to render.
   */
  private validatePosition(position?: string | null): void {
    if (position == null) {
      return
    }
    const allowed = this.options.availablePositions
    if (allowed && allowed.length > 0 && !allowed.includes(position)) {
      throw new UserInputError(
        `Invalid badge position "${position}". Allowed positions: ${allowed.join(', ')}`,
      )
    }
  }
}
