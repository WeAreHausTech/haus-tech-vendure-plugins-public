import { describe, expect, it } from 'vitest'
import { DEFAULT_SYNONYMS_SET_ID_PATTERN } from '../constants'
import { resolveSynonymsSetId } from './synonyms-set-id.helper'

describe('resolveSynonymsSetId', () => {
  const channel = { id: 42, token: 'eu-store', code: 'eu' }

  it('replaces channelToken placeholder', () => {
    expect(resolveSynonymsSetId('vendure-synonyms-{channelToken}', channel)).toBe(
      'vendure-synonyms-eu-store',
    )
  })

  it('replaces channelId and channelCode placeholders', () => {
    expect(
      resolveSynonymsSetId('synonyms-{channelId}-{channelCode}', channel),
    ).toBe('synonyms-42-eu')
  })

  it('uses the default pattern constant', () => {
    expect(resolveSynonymsSetId(DEFAULT_SYNONYMS_SET_ID_PATTERN, channel)).toBe(
      'vendure-synonyms-eu-store',
    )
  })
})
