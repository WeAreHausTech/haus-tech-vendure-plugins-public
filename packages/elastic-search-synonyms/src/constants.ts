import type { PluginInitOptions } from './types'

export const ELASTIC_SEARCH_SYNONYMS_OPTIONS = Symbol('ELASTIC_SEARCH_SYNONYMS_OPTIONS')
export const loggerCtx = 'ElasticSearchSynonymsPlugin'
export const DEFAULT_SYNONYMS_SET_ID = 'vendure-synonyms'
export const DEFAULT_SYNONYMS_SET_ID_PATTERN = `${DEFAULT_SYNONYMS_SET_ID}-{channelToken}`

export const DEFAULT_PLUGIN_OPTIONS: Required<
  Pick<
    PluginInitOptions,
    | 'maxGroupBytes'
    | 'maxTokenLength'
    | 'maxTokensPerGroup'
    | 'synonymsSetId'
    | 'channelSpecificSynonyms'
    | 'synonymsSetIdPattern'
  >
> = {
  maxGroupBytes: 16_000,
  maxTokenLength: 128,
  maxTokensPerGroup: 128,
  synonymsSetId: DEFAULT_SYNONYMS_SET_ID,
  channelSpecificSynonyms: false,
  synonymsSetIdPattern: DEFAULT_SYNONYMS_SET_ID_PATTERN,
}
