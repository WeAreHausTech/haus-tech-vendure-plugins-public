import { Resolver, Mutation, Args } from '@nestjs/graphql'
import { RequestContext, Ctx, Transaction } from '@vendure/core'
import { MutationAddNoteToOrderArgs } from '../types'
import { AddNoteToOrderService } from '../services/add-note-to-order.service'

@Resolver()
export class AddNoteToOrderResolver {
  constructor(private addNoteToOrderService: AddNoteToOrderService) {}

  @Transaction()
  @Mutation()
  async addNoteToOrder(@Ctx() ctx: RequestContext, @Args() args: MutationAddNoteToOrderArgs) {
    const customCtx = await this.addNoteToOrderService.createDefaultChannelContext(ctx)
    return this.addNoteToOrderService.addNoteToOrder(customCtx, args.input)
  }
}
