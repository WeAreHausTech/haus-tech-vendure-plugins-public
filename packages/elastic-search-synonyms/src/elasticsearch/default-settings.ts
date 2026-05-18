import { DEFAULT_SYNONYMS_SET_ID } from '../constants'

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
