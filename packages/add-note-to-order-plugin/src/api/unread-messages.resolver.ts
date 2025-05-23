import { Query, Resolver, Args } from '@nestjs/graphql'
import { Ctx, ListQueryBuilder, ListQueryOptions, RequestContext } from '@vendure/core'
import { OrderHistoryEntry } from '@vendure/core/dist/entity/history-entry/order-history-entry.entity'
import { HistoryEntryType } from '@vendure/common/lib/generated-types'
import { In, Raw } from 'typeorm'

@Resolver()
export class UnreadMessagesResolver {
  constructor(private listQueryBuilder: ListQueryBuilder) {}

  @Query()
  async unreadMessages(
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
          data: Raw(
            (alias) =>
              `JSON_EXTRACT(${alias}, '$.readAt') IS NULL AND JSON_EXTRACT(${alias}, '$.fromCustomer') = 'true'`,
          ),
        },
      })
      .getManyAndCount()
      .then(([items, totalItems]) => ({
        items,
        totalItems,
      }))


  }
}
