import { Args, Query, Resolver, Mutation } from '@nestjs/graphql'
import {
  Allow,
  Ctx,
  ID,
  ListQueryOptions,
  PaginatedList,
  Permission,
  RequestContext,
  Transaction,
} from '@vendure/core'
import { BadgeService } from '../service/badge.service'
import { Badge } from '../entity/badge.entity'
import {
  CreateBadgeInput,
  DeletionResponse,
  DeletionResult,
  UpdateBadgeInput,
} from '../gql/generated'
import { PLUGIN_INIT_OPTIONS } from '../constants'
import { Inject } from '@nestjs/common'
import { BadgePluginOptions } from '../badge.plugin'

@Resolver()
export class BadgeAdminResolver {
  constructor(
    @Inject(PLUGIN_INIT_OPTIONS) private config: BadgePluginOptions,
    private badgeService: BadgeService,
  ) {}

  @Query()
  @Allow(Permission.ReadCatalog)
  async badges(
    @Ctx() ctx: RequestContext,
    @Args() args: { options?: ListQueryOptions<Badge> },
  ): Promise<PaginatedList<Badge>> {
    return this.badgeService.findAll(ctx, args.options || undefined)
  }

  @Query()
  @Allow(Permission.ReadCatalog)
  async badge(@Ctx() ctx: RequestContext, @Args('id') id: ID): Promise<Badge | null> {
    return this.badgeService.findOne(ctx, id)
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.CreateCatalog)
  async createBadge(
    @Ctx() ctx: RequestContext,
    @Args('input') input: CreateBadgeInput,
  ): Promise<Badge> {
    return this.badgeService.create(ctx, input)
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.UpdateCatalog)
  async updateBadge(
    @Ctx() ctx: RequestContext,
    @Args('input') input: UpdateBadgeInput,
  ): Promise<Badge> {
    return this.badgeService.update(ctx, input)
  }

  @Mutation()
  @Transaction()
  @Allow(Permission.DeleteCatalog)
  async deleteBadge(
    @Ctx() ctx: RequestContext,
    @Args('ids') ids: ID[],
  ): Promise<DeletionResponse> {
    try {
      for (const badgeId of ids) {
        const badge = await this.badgeService.findOne(ctx, badgeId)
        if (badge) {
          await this.badgeService.delete(ctx, badge)
        }
      }
      return { result: DeletionResult.DELETED }
    } catch (e) {
      return {
        result: DeletionResult.NOT_DELETED,
        message: e instanceof Error ? e.message : String(e),
      }
    }
  }

  @Query()
  @Allow(Permission.ReadCatalog)
  getBadgePluginConfig() {
    return this.config
  }
}
