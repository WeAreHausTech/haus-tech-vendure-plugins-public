import { Query, Resolver, Args } from '@nestjs/graphql'
import { Ctx, ListQueryBuilder, ListQueryOptions, RequestContext } from '@vendure/core'
import { OrderHistoryEntry } from '@vendure/core/dist/entity/history-entry/order-history-entry.entity'
import { HistoryEntryType } from '@vendure/common/lib/generated-types'
import { In } from 'typeorm'

@Resolver()
export class OrderNoteHistoryEntryResolver {
  constructor(private listQueryBuilder: ListQueryBuilder) {}

  @Query()
  async orderNoteHistoryEntries(
    @Ctx() ctx: RequestContext,
    @Args('options') options: ListQueryOptions<OrderHistoryEntry>,
  ) {
    return this.listQueryBuilder
      .build(OrderHistoryEntry, options, {
        ctx,
        relations: ['order'],
        where: {
          type: 'ORDER_NOTE' as HistoryEntryType,
          order: {
            channels: {
              id: In([ctx.channelId]), 
            },
          },
        },
      })
      .getManyAndCount()
      .then(([items, totalItems]) => ({
        items,
        totalItems,
      }))
  }
}
