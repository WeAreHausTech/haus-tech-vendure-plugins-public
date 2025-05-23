import { Injectable } from '@nestjs/common'
import {
  HistoryService,
  ID,
  Order,
  RequestContext,
  EventBus,
  TransactionalConnection,
  SellerService,
  ChannelService,
} from '@vendure/core'
import { HistoryEntryType } from '@vendure/common/lib/generated-types'
import { NewMessageEvent } from '../events/new-message-event'
import { AddNoteToOrderInput } from '../types'

@Injectable()
export class AddNoteToOrderService {
  constructor(
    private connection: TransactionalConnection,
    private historyService: HistoryService,
    private eventBus: EventBus,
    private sellerService: SellerService,
    private channelService: ChannelService,
  ) {}

  async addNoteToOrder(ctx: RequestContext, input: AddNoteToOrderInput) {
    const customCtx = await this.createDefaultChannelContext(ctx)
    const order = await this.connection.getEntityOrThrow(customCtx, Order, input.id, {
      relations: ['channels', 'customer', 'channels.seller'],
    })
    await this.historyService.createHistoryEntryForOrder(
      {
        ctx,
        orderId: order.id,
        type: HistoryEntryType.ORDER_NOTE,
        data: {
          note: input.note,
          fromCustomer: input.fromCustomer,
        },
      },
      true,
    )

    await this.addEvent(ctx, order, input)

    return order
  }

  async addEvent(ctx: RequestContext, order: Order, input: AddNoteToOrderInput) {
    const channel =
      order.channels.find((channel) => channel.code !== '__default_channel__') ?? order.channels[0]
    const seller = channel ? channel.seller : undefined

    this.eventBus.publish(
      new NewMessageEvent(ctx, {
        message: input.note,
        seller: seller,
        customer: order.customer,
        orderId: order.id,
        orderCode: order.code,
      }),
    )
  }

  async createDefaultChannelContext(ctx: RequestContext) {
    const defaultChannel = await this.channelService.getDefaultChannel()
    return new RequestContext({
      ...ctx,
      apiType: ctx.apiType,
      isAuthorized: ctx.isAuthorized,
      authorizedAsOwnerOnly: ctx.authorizedAsOwnerOnly,
      channel: defaultChannel,
    })
  }
}
