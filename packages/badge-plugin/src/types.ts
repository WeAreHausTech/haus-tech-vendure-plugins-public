import { Scalars } from '@vendure/core'

export type AssignBadgesToChannelInput = {
  badgeIds: Array<Scalars['ID']>
  channelId: Scalars['ID']
}
