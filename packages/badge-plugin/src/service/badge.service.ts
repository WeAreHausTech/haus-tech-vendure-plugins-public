import { Inject, Injectable } from '@nestjs/common'
import { In } from 'typeorm'
import {
  AssetService,
  ChannelService,
  Collection,
  CollectionService,
  EntityHydrator,
  EntityNotFoundError,
  ID,
  ListQueryBuilder,
  ListQueryOptions,
  PaginatedList,
  Product,
  RequestContext,
  TransactionalConnection,
  UserInputError,
} from '@vendure/core'
import { Badge } from '../entity/badge.entity'
import { CreateBadgeInput, DeletionResponse, DeletionResult, UpdateBadgeInput } from '../gql/generated'
import { SearchResult } from '@vendure/common/lib/generated-shop-types'
import { AssignBadgesToChannelInput } from '../types'
import { PLUGIN_INIT_OPTIONS } from '../constants'
import { BadgePluginOptions } from '../badge.plugin'

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
  ) {}

  async findOne(ctx: RequestContext, id: ID): Promise<Badge | null> {
    return this.connection
      .getRepository(ctx, Badge)
      .findOne({ where: { id }, relations: ['collection', 'asset', 'channels'] })
  }

  async findAll(
    ctx: RequestContext,
    options?: ListQueryOptions<Badge>,
  ): Promise<PaginatedList<Badge>> {
    return this.listQueryBuilder
      .build(Badge, options, { relations: ['collection', 'asset', 'channels'], ctx })
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

    await repository.update(input.id, {
      position: input.position ?? badge.position,
      text: input.text ?? badge.text,
      collectionId: input.collectionId,
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
    const collections = await this.collectionService.getCollectionsByProductId(
      ctx,
      product.id,
      true,
    )
    const collectionIds = collections.map((c) => c.id)
    return this.findByCollectionIds(ctx, collectionIds)
  }

  async findBadgesForSearchResult(
    ctx: RequestContext,
    searchResult: SearchResult,
  ): Promise<Badge[]> {
    const collections = await this.collectionService.getCollectionsByProductId(
      ctx,
      searchResult.productId,
      true,
    )
    const collectionIds = collections.map((c) => c.id)
    return this.findByCollectionIds(ctx, collectionIds)
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
