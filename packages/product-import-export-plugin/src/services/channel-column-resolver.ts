import { Injectable } from '@nestjs/common'
import {
  Channel,
  ChannelService,
  idsAreEqual,
  Permission,
  RequestContext,
  TransactionalConnection,
} from '@vendure/core'
import { In } from 'typeorm'
import { ParsedProductWithId } from '../types'

/** The column that names, by token, the channels a row's product is assigned to. */
export const CHANNELS_COLUMN = 'channels'

/** Rights the upload endpoint asks for in the active channel, asked here in every named channel. */
const PRODUCT_RIGHTS = [Permission.UpdateCatalog, Permission.UpdateProduct]

/** The channels of one import's `channels` column, by token. */
export type ChannelsByToken = Map<string, Channel>

export interface ResolvedChannelColumn {
  /** One `Row N: channels: ...` line per rejected token. Any error stops the whole import. */
  errors: string[]
  channelsByToken: ChannelsByToken
}

/**
 * Checks the tokens of the `channels` column before anything is written. A token must name a
 * channel; an import run outside the default channel can only name its own channel; and the
 * uploader needs product rights in every channel named. A context without a user (server code
 * calling the importer itself) is trusted, as Vendure trusts it.
 */
@Injectable()
export class ChannelColumnResolver {
  constructor(
    private connection: TransactionalConnection,
    private channelService: ChannelService,
  ) {}

  async resolve(
    ctx: RequestContext,
    uploader: RequestContext,
    rows: ParsedProductWithId[],
  ): Promise<ResolvedChannelColumn> {
    const tokens = [...new Set(rows.flatMap((row) => row.product.channelTokens))]
    if (tokens.length === 0) {
      return { errors: [], channelsByToken: new Map() }
    }
    const channels = await this.connection
      .getRepository(ctx, Channel)
      .find({ where: { token: In(tokens) } })
    const channelsByToken: ChannelsByToken = new Map(
      channels.map((channel) => [channel.token, channel]),
    )
    const defaultChannel = await this.channelService.getDefaultChannel(ctx)
    const importsInDefaultChannel = idsAreEqual(ctx.channelId, defaultChannel.id)

    const errors: string[] = []
    for (const { product } of rows) {
      for (const token of product.channelTokens) {
        const problem = this.problemWith(
          token,
          channelsByToken.get(token),
          ctx,
          uploader,
          importsInDefaultChannel,
        )
        if (problem) {
          errors.push(`Row ${product.line}: ${CHANNELS_COLUMN}: ${problem}`)
        }
      }
    }
    return { errors, channelsByToken }
  }

  private problemWith(
    token: string,
    channel: Channel | undefined,
    ctx: RequestContext,
    uploader: RequestContext,
    importsInDefaultChannel: boolean,
  ): string | undefined {
    if (!channel) {
      return `no channel with token '${token}'`
    }
    if (!importsInDefaultChannel && !idsAreEqual(channel.id, ctx.channelId)) {
      const own = ctx.channel.token
      return `an import run in channel '${own}' can only name '${own}', not '${token}'`
    }
    if (uploader.activeUserId && !hasProductRights(uploader, channel)) {
      return `no right to update products in channel '${token}'`
    }
  }
}

function hasProductRights(uploader: RequestContext, channel: Channel): boolean {
  const channelPermissions = uploader.session?.user?.channelPermissions ?? []
  const permissions =
    channelPermissions.find((entry) => idsAreEqual(entry.id, channel.id))?.permissions ?? []
  return PRODUCT_RIGHTS.some((right) => permissions.includes(right))
}
