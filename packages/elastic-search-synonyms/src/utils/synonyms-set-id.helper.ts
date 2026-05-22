import { ID } from '@vendure/core'
import { DEFAULT_SYNONYMS_SET_ID, DEFAULT_SYNONYMS_SET_ID_PATTERN } from '../constants'

export { DEFAULT_SYNONYMS_SET_ID_PATTERN } from '../constants'

export type SynonymsSetChannelRef = {
  id: ID
  token: string
  code: string
}

/**
 * Resolves the Elasticsearch synonyms set id for a channel from a pattern.
 *
 * Supported placeholders: `{channelToken}`, `{channelId}`, `{channelCode}`.
 *
 * @example
 * resolveSynonymsSetId('vendure-synonyms-{channelToken}', { id: 1, token: 'eu-store', code: 'eu' })
 * // => 'vendure-synonyms-eu-store'
 */
export function resolveSynonymsSetId(
  pattern: string,
  channel: SynonymsSetChannelRef,
): string {
  return pattern
    .replaceAll('{channelToken}', channel.token)
    .replaceAll('{channelId}', String(channel.id))
    .replaceAll('{channelCode}', channel.code)
}
