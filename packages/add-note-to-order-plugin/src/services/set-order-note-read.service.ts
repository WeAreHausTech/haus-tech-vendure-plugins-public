import { Injectable } from '@nestjs/common'
import { HistoryService, RequestContext } from '@vendure/core'
import { MutationSetOrderNoteReadArgs } from '../types'
import { AddNoteToOrderService } from './add-note-to-order.service'
import { HistoryEntryType } from '@vendure/common/lib/generated-types'

@Injectable()
export class SetOrderNoteReadService {
  constructor(
    private historyService: HistoryService,
    private addNoteToOrderService: AddNoteToOrderService,
  ) {}

  async setOrderNoteRead(ctx: RequestContext, input: MutationSetOrderNoteReadArgs['input']) {
    const customCtx = await this.addNoteToOrderService.createDefaultChannelContext(ctx)
    const result = await this.historyService.updateOrderHistoryEntry<HistoryEntryType.ORDER_NOTE>(
      customCtx,
      {
        ctx: customCtx,
        type: HistoryEntryType.ORDER_NOTE,
        entryId: input.id,
        isPublic: true,
        data: {
          readAt: new Date().toISOString(),
          ...input.data
        },
      },
    )

    return result
  }
}
