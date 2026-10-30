import { describe, expect, it } from 'vitest'
import { isPromotionActive, shouldShowPromotionBadge, PromotionFacts } from './promotion-badge-rule'

const now = new Date('2026-06-01T12:00:00Z')
const active: PromotionFacts = {
  enabled: true,
  deletedAt: null,
  couponCode: null,
  startsAt: null,
  endsAt: null,
}

describe('isPromotionActive', () => {
  it('is true for an enabled promotion without limits', () => {
    expect(isPromotionActive(active, now)).toBe(true)
  })

  it.each([
    ['disabled', { enabled: false }],
    ['deleted', { deletedAt: now }],
    ['coupon code', { couponCode: 'SAVE' }],
    ['not started', { startsAt: new Date('2026-06-02T00:00:00Z') }],
    ['ended', { endsAt: new Date('2026-06-01T11:59:59Z') }],
    ['ends exactly now', { endsAt: now }],
  ])('is false when %s', (_name, override) => {
    expect(isPromotionActive({ ...active, ...override }, now)).toBe(false)
  })

  it('is true for an empty coupon code, a start equal to now, and a running window', () => {
    expect(isPromotionActive({ ...active, couponCode: '' }, now)).toBe(true)
    expect(isPromotionActive({ ...active, startsAt: now }, now)).toBe(true)
    expect(
      isPromotionActive(
        {
          ...active,
          startsAt: new Date('2026-05-01T00:00:00Z'),
          endsAt: new Date('2026-07-01T00:00:00Z'),
        },
        now,
      ),
    ).toBe(true)
  })
})

describe('shouldShowPromotionBadge', () => {
  it('shows with zero conditions', () => {
    expect(shouldShowPromotionBadge(active, [], now)).toBe(true)
  })

  it('shows only when every condition matches', () => {
    expect(shouldShowPromotionBadge(active, ['match', 'match'], now)).toBe(true)
    expect(shouldShowPromotionBadge(active, ['match', 'no-match'], now)).toBe(false)
    expect(shouldShowPromotionBadge(active, ['match', 'unchecked'], now)).toBe(false)
  })

  it('does not show an inactive promotion', () => {
    expect(shouldShowPromotionBadge({ ...active, enabled: false }, ['match'], now)).toBe(false)
  })
})
