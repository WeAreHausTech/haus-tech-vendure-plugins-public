import { describe, expect, it } from 'vitest'
import { TransactionalConnection } from '@vendure/core'
import type { Injector, RequestContext } from '@vendure/core'
import { containsProductsCheck } from './contains-products-check'

const injector = {
  get: (token: unknown) => {
    if (token === TransactionalConnection) {
      return {
        getRepository: () => ({
          find: async () => [{ id: '11' }, { id: '12' }],
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
