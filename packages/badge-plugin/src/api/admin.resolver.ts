import { Args, Query, Resolver, Mutation } from '@nestjs/graphql'
import { Ctx, ErrorResult, Logger, PaginatedList, RequestContext } from '@vendure/core'
import { BadgeService } from '../service/badge.service'
import { Badge } from '../entity/badge.entity'
import {
  CreateBadgeInput,
  DeletionResponse,
  DeletionResult,
  UpdateBadgeInput,
} from '../gql/generated'
import { PLUGIN_INIT_OPTIONS, loggerCtx } from '../constants'
import { Inject } from '@nestjs/common'
import { BadgePluginOptions } from '../badge.plugin'

@Resolver()
export class BadgeAdminResolver {
  constructor(
    @Inject(PLUGIN_INIT_OPTIONS) private config: BadgePluginOptions,
    private badgeService: BadgeService,
  ) {}

  @Query()
  async badges(@Ctx() ctx: RequestContext, @Args() args: any): Promise<PaginatedList<Badge>> {
    return this.badgeService.findAll(ctx, args.options || undefined)
  }

  @Query()
  async badge(@Ctx() ctx: RequestContext, @Args('id') id: string): Promise<Badge | null> {
    return this.badgeService.findOne(ctx, parseInt(id, 10))
  }

  @Mutation()
  async createBadge(
    @Ctx() ctx: RequestContext,
    @Args('input') input: CreateBadgeInput,
  ): Promise<Badge> {
    return this.badgeService.create(ctx, input)
  }

  @Mutation()
  async updateBadge(
    @Ctx() ctx: RequestContext,
    @Args('input') input: UpdateBadgeInput,
  ): Promise<Badge | ErrorResult> {
    return this.badgeService.update(ctx, input)
  }

  @Mutation()
  async deleteBadge(
    @Ctx() ctx: RequestContext,
    @Args('ids') ids: string[],
  ): Promise<DeletionResponse> {
    try {
      for (const badgeId of ids) {
        const badge = await this.badgeService.findOne(ctx, parseInt(badgeId, 10))
        if (badge) {
          await this.badgeService.delete(ctx, badge)
        }
      }
      return { result: DeletionResult.DELETED }
    } catch (e: any) {
      return { result: DeletionResult.NOT_DELETED, message: e.message }
    }
  }

  @Query()
  getBadgePluginConfig() {
    return this.config
  }
}
