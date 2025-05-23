import { Resolver, Mutation, Args } from '@nestjs/graphql'
import { RequestContext, Ctx, Transaction } from '@vendure/core'
import { MutationSetOrderNoteReadArgs } from '../types'
import { SetOrderNoteReadService } from '../services/set-order-note-read.service'
import { OrderHistoryEntry } from '@vendure/core/dist/entity/history-entry/order-history-entry.entity'
import { AddNoteToOrderService } from '../services/add-note-to-order.service'

@Resolver()
export class SetOrderNoteReadResolver {
  constructor(
    private setOrderNoteReadService: SetOrderNoteReadService,
    private addNoteToOrderService: AddNoteToOrderService,
  ) {}

  @Transaction()
  @Mutation()
  async setOrderNoteRead(
    @Ctx() ctx: RequestContext,
    @Args() args: MutationSetOrderNoteReadArgs,
  ): Promise<OrderHistoryEntry> {
    const customCtx = await this.addNoteToOrderService.createDefaultChannelContext(ctx)
    const response = await this.setOrderNoteReadService.setOrderNoteRead(customCtx, args.input)

    return response
  }
}
