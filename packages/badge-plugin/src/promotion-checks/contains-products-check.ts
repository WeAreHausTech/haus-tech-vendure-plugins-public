import { idsAreEqual, ProductVariant, TransactionalConnection } from '@vendure/core'
import { IsNull } from 'typeorm'
import type { PromotionProductCheck } from './promotion-product-check'

/**
 * Shipped check for Vendure's `contains_products` condition: matches when the
 * product has an enabled, non-deleted variant among the condition's variants. The
 * required quantity is ignored, a product page has no order.
 */
export const containsProductsCheck: PromotionProductCheck = {
  code: 'contains_products',
  async matches({ ctx, injector, productId, args }) {
    const listed = (args.productVariantIds as Array<string | number> | undefined) ?? []
    if (listed.length === 0) return false
    const variants = await injector
      .get(TransactionalConnection)
      .getRepository(ctx, ProductVariant)
      .find({ where: { productId, deletedAt: IsNull(), enabled: true }, select: { id: true } })
    return variants.some((variant) => listed.some((id) => idsAreEqual(id, variant.id)))
  },
}
