import { describe, expect, it, vi } from 'vitest'
import { IsNull } from 'typeorm'
import { TransactionalConnection } from '@vendure/core'
import type { Injector, RequestContext } from '@vendure/core'
import { containsProductsCheck } from './contains-products-check'

const find = vi.fn<(options: { where: Record<string, unknown> }) => Promise<Array<{ id: string }>>>(
  async () => [{ id: '11' }, { id: '12' }],
)
const injector = {
  get: (token: unknown) => {
    if (token === TransactionalConnection) {
      return {
        getRepository: () => ({
          find,
        }),
      }
    }
    throw new Error('unexpected token')
  },
} as unknown as Injector

const run = (args: Record<string, unknown>) =>
  containsProductsCheck.matches({ ctx: {} as RequestContext, injector, productId: '1', args })

describe('containsProductsCheck', () => {
  it('has the shipped code', () => {
    expect(containsProductsCheck.code).toBe('contains_products')
  })

  it('matches when a variant of the product is listed, ignoring quantity', async () => {
    expect(await run({ productVariantIds: ['12'], minimum: 5 })).toBe(true)
  })

  it('queries only non-deleted variants of the product', async () => {
    await run({ productVariantIds: ['12'] })
    const where = find.mock.calls[find.mock.calls.length - 1][0].where
    expect(where.productId).toBe('1')
    expect(where.deletedAt).toEqual(IsNull())
  })

  it('matches numeric ids against string ids', async () => {
    expect(await run({ productVariantIds: [11] })).toBe(true)
  })

  it('does not match when no variant is listed', async () => {
    expect(await run({ productVariantIds: ['99'] })).toBe(false)
  })

  it('does not match an empty list', async () => {
    expect(await run({ productVariantIds: [] })).toBe(false)
  })
})
