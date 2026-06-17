import { ID, LanguageCode } from '@vendure/core'

/**
 * @description
 * Options passed to {@link ElasticSearchSynonymsPlugin}.init to configure how synonym
 * groups are validated and synced to Elasticsearch.
 *
 * @category Options
 */
export interface PluginInitOptions {
  /** Maximum total bytes (UTF-8) allowed for a single synonym group line when synced to Elasticsearch */
  maxGroupBytes?: number
  /** Maximum characters per individual synonym token */
  maxTokenLength?: number
  /** Maximum number of tokens allowed in a single group */
  maxTokensPerGroup?: number
  /**
   * The Elasticsearch synonyms set id that this plugin manages when `channelSpecificSynonyms` is false.
   * Index analyzers should reference this id via `synonyms_set` in their `synonym` token filter.
   * Defaults to `vendure-synonyms` (or `ELASTICSEARCH_SYNONYMS_SET` env var if set).
   */
  synonymsSetId?: string
  /**
   * When true, each channel gets its own Elasticsearch synonyms set and only that channel's
   * synonym groups are synced to it. Requires per-channel index analyzer configuration.
   * @default false
   */
  channelSpecificSynonyms?: boolean
  /**
   * Pattern for channel-specific synonyms set ids when `channelSpecificSynonyms` is true.
   * Supports `{channelToken}`, `{channelId}`, and `{channelCode}`.
   * @default `vendure-synonyms-{channelToken}`
   */
  synonymsSetIdPattern?: string
}

export interface SynonymGroup {
  id: ID
  synonyms: string[]
  languageCode: LanguageCode
  createdAt: Date
  updatedAt: Date
}

export interface CreateSynonymGroupInput {
  synonyms: string[]
}

export interface UpdateSynonymGroupInput {
  id: ID
  synonyms: string[]
}

export interface SynonymGroupListOptions {
  skip?: number
  take?: number
  sort?: {
    field: string
    order: 'ASC' | 'DESC'
  }
}

export interface SynonymGroupListResult {
  items: SynonymGroup[]
  totalItems: number
}
