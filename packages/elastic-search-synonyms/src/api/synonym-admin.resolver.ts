import { Args, Mutation, Query, Resolver } from '@nestjs/graphql'
import { Ctx, RequestContext, ID, PaginatedList, ListQueryOptions } from '@vendure/core'
import { SynonymService } from '../services/synonym.service'
import { CreateSynonymGroupInput, UpdateSynonymGroupInput, SynonymGroup } from '../types'
import { DeletionResponse } from '../gql/generated'

@Resolver('SynonymGroup')
export class SynonymGroupResolver {
  constructor(private synonymService: SynonymService) {}

  @Query()
  async synonymGroup(@Ctx() ctx: RequestContext, @Args('id') id: ID): Promise<SynonymGroup | null> {
    return await this.synonymService.findOne(ctx, id)
  }

  @Query()
  async synonymGroups(
    @Ctx() ctx: RequestContext,
    @Args('options') options: ListQueryOptions<SynonymGroup>,
  ): Promise<PaginatedList<SynonymGroup>> {
    return await this.synonymService.findAll(ctx, options)
  }

  @Mutation()
  async createSynonymGroup(
    @Ctx() ctx: RequestContext,
    @Args('input') input: CreateSynonymGroupInput,
  ): Promise<SynonymGroup> {
    return await this.synonymService.create(ctx, input)
  }

  @Mutation()
  async updateSynonymGroup(
    @Ctx() ctx: RequestContext,
    @Args('input') input: UpdateSynonymGroupInput,
  ): Promise<SynonymGroup> {
    return await this.synonymService.update(ctx, input)
  }

  @Mutation()
  async deleteSynonymGroup(
    @Ctx() ctx: RequestContext,
    @Args('id') id: ID,
  ): Promise<DeletionResponse> {
    return await this.synonymService.softDelete(ctx, id)
  }
}
