import { Injectable, OnApplicationBootstrap } from '@nestjs/common'
import { In } from 'typeorm'
import {
  AssetService,
  ChannelService,
  CollectionService,
  EntityHydrator,
  ErrorResult,
  ListQueryBuilder,
  ListQueryOptions,
  PaginatedList,
  Product,
  RequestContext,
  TransactionalConnection,
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

@Injectable()
export class BadgeService implements OnApplicationBootstrap {
  constructor(
    private listQueryBuilder: ListQueryBuilder,
    private connection: TransactionalConnection,
    private assetService: AssetService,
    private entityHydratorService: EntityHydrator,
    private collectionService: CollectionService,
    private channelService: ChannelService,
  ) {}

  async onApplicationBootstrap() {
    // Assign all badges which are not assigned to any channel to the default channel
    const defaultChannel = await this.channelService.getDefaultChannel()
    const badgesWithoutChannels = await this.connection.rawConnection
      .getRepository(Badge)
      .createQueryBuilder('badge')
      .leftJoinAndSelect('badge.channels', 'channel')
      .where('channel.id IS NULL')
      .getMany()

    for (const badge of badgesWithoutChannels) {
      badge.channels = [defaultChannel]
      await this.connection.rawConnection.getRepository(Badge).save(badge)
    }
  }

  async findOne(ctx: RequestContext, id: number): Promise<Badge | null> {
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
    const badge = new Badge({
      position: input.position || 'top-left',
      assetId: input.assetId,
      collectionId: input.collectionId || null,
      channels: [ctx.channel],
    })
    return this.connection.getRepository(ctx, Badge).save(badge)
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
    } catch (e: any) {
      return { result: DeletionResult.NOT_DELETED, message: e.message }
    }
  }

  async update(ctx: RequestContext, input: UpdateBadgeInput): Promise<Badge | ErrorResult> {
    let badge = await this.connection
      .getRepository(ctx, Badge)
      .findOne({ where: { id: parseInt(input.id) } })
    if (!badge) {
      throw new Error(`Badge with id ${input.id} not found`)
    }

    try {
      await this.connection.getRepository(ctx, Badge).update(input.id, {
        position: input.position!,
        collectionId: input.collectionId,
        assetId: input.assetId ?? badge.assetId,
      })

      badge = await this.connection
        .getRepository(ctx, Badge)
        .findOne({ where: { id: parseInt(input.id) } })
    } catch (e) {
      return new ErrorResult()
    }
    return badge || new ErrorResult()
  }

  async findOneByCollectionId(ctx: RequestContext, collectionId: string): Promise<Badge | null> {
    const badge = await this.connection
      .getRepository(ctx, Badge)
      .findOne({ where: { collectionId }, relations: ['channels'] })

    if (badge?.channels.some((channel) => channel.id === ctx.channel.id)) {
      return badge
    }

    return null
  }

  async findByCollectionIds(ctx: RequestContext, collectionIds: string[]): Promise<Badge[]> {
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
    const collectionIds = collections.map((c) => c.id) as string[]
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
    const collectionIds = collections.map((c) => c.id) as string[]
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
}
