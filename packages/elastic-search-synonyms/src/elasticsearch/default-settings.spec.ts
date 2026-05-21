import { describe, expect, it } from 'vitest'
import {
  applyChannelSynonymAnalyzerToMapQuery,
  createMultiChannelSynonymIndexSettings,
  getChannelSynonymAnalyzerName,
} from './default-settings'

describe('createMultiChannelSynonymIndexSettings', () => {
  it('creates one filter and analyzer per channel', () => {
    const settings = createMultiChannelSynonymIndexSettings([
      { id: 1, token: 'mats-demo', code: 'md' },
      { id: 2, token: 'public-demo', code: 'pd' },
    ])

    expect(settings.analysis.filter.synonym_filter_mats_demo.synonyms_set).toBe(
      'vendure-synonyms-mats-demo',
    )
    expect(settings.analysis.analyzer.synonym_analyzer_public_demo.filter).toContain(
      'synonym_filter_public_demo',
    )
  })
})

describe('applyChannelSynonymAnalyzerToMapQuery', () => {
  it('sets analyzer on nested term search clauses', () => {
    const query = {
      bool: {
        must: [
          {
            bool: {
              should: [
                {
                  query_string: {
                    query: '*tv*',
                    fields: ['productName^12'],
                  },
                },
                {
                  multi_match: {
                    query: 'tv',
                    fields: ['productName^12'],
                  },
                },
              ],
            },
          },
        ],
      },
    }

    applyChannelSynonymAnalyzerToMapQuery(query, 'mats-demo')

    const analyzer = getChannelSynonymAnalyzerName('mats-demo')
    expect(query.bool.must[0].bool.should[0].query_string.analyzer).toBe(analyzer)
    expect(query.bool.must[0].bool.should[1].multi_match.analyzer).toBe(analyzer)
  })
})
