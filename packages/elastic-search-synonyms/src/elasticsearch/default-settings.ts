import { DEFAULT_SYNONYMS_SET_ID, DEFAULT_SYNONYMS_SET_ID_PATTERN } from '../constants'
import {
  resolveSynonymsSetId,
  type SynonymsSetChannelRef,
} from '../utils/synonyms-set-id.helper'

export {
  resolveSynonymsSetId,
  type SynonymsSetChannelRef,
} from '../utils/synonyms-set-id.helper'
export { DEFAULT_SYNONYMS_SET_ID_PATTERN } from '../constants'

/** Name of the synonym token filter in {@link defaultSynonymAnalyzer}. */
export const SYNONYM_FILTER_NAME = 'synonym_filter'

/** Name of the search analyzer that applies synonyms at query time. */
export const SYNONYM_ANALYZER_NAME = 'synonym_analyzer'

export type SynonymFilterDefinition = {
  type: 'synonym'
  synonyms_set: string
  updateable: true
}

export type SynonymAnalyzerDefinition = {
  tokenizer: string
  filter: string[]
}

export type SynonymIndexMappingProperties = Record<string, unknown>

/**
 * Synonym token filter for the Elasticsearch Synonyms API (ES 8.10+ / 9.x).
 * Spread into `indexSettings.analysis.filter`: `{ ...createSynonymFilter() }`.
 *
 * @param synonymsSetId Must match `ElasticSearchSynonymsPlugin.init({ synonymsSetId })`.
 */
export function createSynonymFilter(
  synonymsSetId: string = DEFAULT_SYNONYMS_SET_ID,
): Record<string, SynonymFilterDefinition> {
  return {
    [SYNONYM_FILTER_NAME]: {
      type: 'synonym',
      synonyms_set: synonymsSetId,
      updateable: true,
    },
  }
}

/** Pre-built filters using {@link DEFAULT_SYNONYMS_SET_ID}. Spread into `analysis.filter`. */
export const defaultSynonymFilters = createSynonymFilter()

/**
 * Synonym filter for one channel when using `channelSpecificSynonyms: true`.
 * The resolved set id must match what the plugin syncs for that channel.
 */
export function createChannelSynonymFilter(
  channel: SynonymsSetChannelRef,
  pattern: string = DEFAULT_SYNONYMS_SET_ID_PATTERN,
  filterName: string = SYNONYM_FILTER_NAME,
): Record<string, SynonymFilterDefinition> {
  const synonymsSetId = resolveSynonymsSetId(pattern, channel)
  return {
    [filterName]: {
      type: 'synonym',
      synonyms_set: synonymsSetId,
      updateable: true,
    },
  }
}

/**
 * Search analyzer for one channel. Pair with {@link createChannelSynonymFilter}.
 */
export function createChannelSynonymAnalyzer(
  filterName: string = SYNONYM_FILTER_NAME,
  analyzerName: string = SYNONYM_ANALYZER_NAME,
): Record<string, SynonymAnalyzerDefinition> {
  return {
    [analyzerName]: {
      tokenizer: 'standard',
      filter: ['lowercase', filterName],
    },
  }
}

/** Safe Elasticsearch identifier derived from a channel token. */
export function sanitizeChannelTokenForElasticsearchName(channelToken: string): string {
  return channelToken.replace(/[^a-zA-Z0-9_]/g, '_')
}

export function getChannelSynonymFilterName(channelToken: string): string {
  return `synonym_filter_${sanitizeChannelTokenForElasticsearchName(channelToken)}`
}

export function getChannelSynonymAnalyzerName(channelToken: string): string {
  return `synonym_analyzer_${sanitizeChannelTokenForElasticsearchName(channelToken)}`
}

/**
 * Builds analysis settings with one synonym filter + search analyzer per channel.
 * Use with a shared Elasticsearch index and set the analyzer on search queries per channel.
 */
export function createMultiChannelSynonymIndexSettings(
  channels: SynonymsSetChannelRef[],
  pattern: string = DEFAULT_SYNONYMS_SET_ID_PATTERN,
): { analysis: { filter: Record<string, SynonymFilterDefinition>; analyzer: Record<string, SynonymAnalyzerDefinition> } } {
  const filter: Record<string, SynonymFilterDefinition> = {}
  const analyzer: Record<string, SynonymAnalyzerDefinition> = {}

  for (const channel of channels) {
    const filterName = getChannelSynonymFilterName(channel.token)
    const analyzerName = getChannelSynonymAnalyzerName(channel.token)
    filter[filterName] = {
      type: 'synonym',
      synonyms_set: resolveSynonymsSetId(pattern, channel),
      updateable: true,
    }
    analyzer[analyzerName] = {
      tokenizer: 'standard',
      filter: ['lowercase', filterName],
    }
  }

  return { analysis: { filter, analyzer } }
}

/**
 * Applies the channel-specific synonym analyzer to term search clauses created by mapQuery helpers.
 */
export function applyChannelSynonymAnalyzerToMapQuery(
  query: Record<string, any>,
  channelToken: string,
): void {
  const analyzer = getChannelSynonymAnalyzerName(channelToken)
  const must = query?.bool?.must
  if (!Array.isArray(must)) {
    return
  }

  for (const clause of must) {
    if (clause?.multi_match) {
      clause.multi_match.analyzer = analyzer
    }
    if (Array.isArray(clause?.bool?.should)) {
      for (const shouldClause of clause.bool.should) {
        if (shouldClause?.query_string) {
          shouldClause.query_string.analyzer = analyzer
        }
        if (shouldClause?.multi_match) {
          shouldClause.multi_match.analyzer = analyzer
        }
      }
    }
  }
}

/**
 * Search analyzer that lowercases the query then applies {@link SYNONYM_FILTER_NAME}.
 * Spread into `indexSettings.analysis.analyzer`: `{ ...defaultSynonymAnalyzer }`.
 *
 * Requires `synonym_filter` in `analysis.filter` (use {@link createSynonymFilter} or {@link defaultSynonymFilters}).
 */
export const defaultSynonymAnalyzer: Record<string, SynonymAnalyzerDefinition> = {
  [SYNONYM_ANALYZER_NAME]: {
    tokenizer: 'standard',
    filter: ['lowercase', SYNONYM_FILTER_NAME],
  },
}

/**
 * Example field mappings for synonym-aware search for product name and description.
 * `search_analyzer` must be {@link SYNONYM_ANALYZER_NAME}.
 */
export const defaultSynonymIndexMappingProperties: SynonymIndexMappingProperties = {
  productName: {
    type: 'text',
    search_analyzer: SYNONYM_ANALYZER_NAME,
    fields: {
      keyword: {
        type: 'keyword',
        ignore_above: 256,
      },
    },
  },
  productDescription: {
    type: 'text',
    search_analyzer: SYNONYM_ANALYZER_NAME,
  },
}
