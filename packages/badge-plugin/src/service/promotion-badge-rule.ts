export type ConditionResult = 'match' | 'no-match' | 'unchecked'

export interface PromotionFacts {
  enabled: boolean
  deletedAt: Date | null
  couponCode: string | null
  startsAt: Date | null
  endsAt: Date | null
}

/**
 * A promotion is active when it is enabled, not deleted, needs no coupon code
 * and the current time is inside its window (start inclusive, end exclusive).
 */
export function isPromotionActive(promotion: PromotionFacts, now: Date): boolean {
  if (!promotion.enabled || promotion.deletedAt !== null) return false
  if (promotion.couponCode) return false
  if (promotion.startsAt && promotion.startsAt.getTime() > now.getTime()) return false
  if (promotion.endsAt && promotion.endsAt.getTime() <= now.getTime()) return false
  return true
}

/** Show the badge for an active promotion whose conditions all match. */
export function shouldShowPromotionBadge(
  promotion: PromotionFacts,
  conditionResults: ConditionResult[],
  now: Date,
): boolean {
  return isPromotionActive(promotion, now) && conditionResults.every((result) => result === 'match')
}
