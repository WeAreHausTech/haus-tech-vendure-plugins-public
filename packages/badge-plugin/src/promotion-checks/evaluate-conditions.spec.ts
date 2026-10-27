import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '@vendure/core'
import type { Injector, PromotionCondition, RequestContext } from '@vendure/core'
import type { ConfigurableOperation } from '@vendure/common/lib/generated-types'
import { buildCheckRegistry, evaluateConditions, uncheckedConditionCodes } from './evaluate-conditions'
import type { PromotionProductCheck } from './promotion-product-check'

const def = (code: string) =>
  ({ code, argsArrayToHash: () => ({ parsed: true }) }) as unknown as PromotionCondition
const cond = (code: string): ConfigurableOperation => ({ code, args: [] })
const ctx = {} as RequestContext
const injector = {} as Injector

const base = (conditions: ConfigurableOperation[], registry: Map<string, PromotionProductCheck>) => ({
  ctx,
  injector,
  productId: '1',
  conditions,
  definitions: [def('a'), def('b')],
  registry,
})

describe('buildCheckRegistry', () => {
  it('holds the shipped check by default', () => {
    expect(buildCheckRegistry(undefined).has('contains_products')).toBe(true)
  })

  it('lets a custom check replace the shipped one', () => {
    const custom: PromotionProductCheck = { code: 'contains_products', matches: () => true }
    expect(buildCheckRegistry([custom]).get('contains_products')).toBe(custom)
  })
})

describe('evaluateConditions', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns match and passes parsed args', async () => {
    const matches = vi.fn().mockResolvedValue(true)
    const registry = new Map([['a', { code: 'a', matches }]])
    expect(await evaluateConditions(base([cond('a')], registry))).toEqual(['match'])
    expect(matches).toHaveBeenCalledWith({ ctx, injector, productId: '1', args: { parsed: true } })
  })

  it('returns no-match when the check says false', async () => {
    const registry = new Map([['a', { code: 'a', matches: () => false }]])
    expect(await evaluateConditions(base([cond('a')], registry))).toEqual(['no-match'])
  })

  it('returns unchecked without a registered check', async () => {
    expect(await evaluateConditions(base([cond('a')], new Map()))).toEqual(['unchecked'])
  })

  it('returns unchecked for a code without a definition', async () => {
    const registry = new Map([['z', { code: 'z', matches: () => true }]])
    expect(await evaluateConditions(base([cond('z')], registry))).toEqual(['unchecked'])
  })

  it('returns no-match and logs when a check throws', async () => {
    const error = vi.spyOn(Logger, 'error').mockImplementation(() => undefined)
    const registry = new Map([
      [
        'a',
        {
          code: 'a',
          matches: () => {
            throw new Error('boom')
          },
        },
      ],
    ])
    expect(await evaluateConditions(base([cond('a')], registry))).toEqual(['no-match'])
    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0][0])).toContain('a')
  })

  it('stops at the first non-match', async () => {
    const second = vi.fn().mockReturnValue(true)
    const registry = new Map<string, PromotionProductCheck>([
      ['a', { code: 'a', matches: () => false }],
      ['b', { code: 'b', matches: second }],
    ])
    expect(await evaluateConditions(base([cond('a'), cond('b')], registry))).toEqual(['no-match'])
    expect(second).not.toHaveBeenCalled()
  })
})

describe('uncheckedConditionCodes', () => {
  it('lists codes with no check or no definition, in order', () => {
    const registry = new Map([['b', { code: 'b', matches: () => true }]])
    expect(
      uncheckedConditionCodes([cond('z'), cond('b'), cond('a')], [def('a'), def('b')], registry),
    ).toEqual(['z', 'a'])
  })
})
