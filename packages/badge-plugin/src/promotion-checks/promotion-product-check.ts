import type { ID, Injector, RequestContext } from '@vendure/core'

export interface PromotionProductCheckInput {
  ctx: RequestContext
  injector: Injector
  productId: ID
  /** The condition's arguments, parsed as Vendure parses them for check(). */
  args: Record<string, unknown>
}

/**
 * Answers whether a product satisfies one kind of promotion condition,
 * without needing an order.
 */
export interface PromotionProductCheck {
  /** The code of the promotion condition this check answers for. */
  code: string
  matches(input: PromotionProductCheckInput): boolean | Promise<boolean>
}
