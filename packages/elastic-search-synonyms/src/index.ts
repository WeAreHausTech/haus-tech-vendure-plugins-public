export * from './elastic-search-synonyms.plugin'
export * from './services/synonym.service'
export * from './elasticsearch/default-settings'
export { DEFAULT_SYNONYMS_SET_ID } from './constants'
export {
  DEFAULT_SYNONYMS_SET_ID_PATTERN,
  resolveSynonymsSetId,
  type SynonymsSetChannelRef,
} from './utils/synonyms-set-id.helper'
