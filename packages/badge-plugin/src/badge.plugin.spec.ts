import { afterEach, describe, expect, it } from 'vitest'
import { BadgePlugin } from './badge.plugin'

describe('BadgePlugin.init', () => {
  const original = BadgePlugin.options
  afterEach(() => {
    BadgePlugin.options = original
  })

  it('keeps the default positions when only checks are passed', () => {
    BadgePlugin.init({ promotionProductChecks: [] })
    expect(BadgePlugin.options.availablePositions).toEqual([
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ])
    expect(BadgePlugin.options.promotionProductChecks).toEqual([])
  })
})
