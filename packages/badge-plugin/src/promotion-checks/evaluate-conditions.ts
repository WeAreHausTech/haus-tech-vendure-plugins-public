import { Logger } from '@vendure/core'
import type { ID, Injector, PromotionCondition, RequestContext } from '@vendure/core'
import type { ConfigurableOperation } from '@vendure/common/lib/generated-types'
import { loggerCtx } from '../constants'
import type { ConditionResult } from '../service/promotion-badge-rule'
import { containsProductsCheck } from './contains-products-check'
import type { PromotionProductCheck } from './promotion-product-check'

type ArgsParser = { argsArrayToHash(args: ConfigurableOperation['args']): Record<string, unknown> }

function findDefinition(definitions: PromotionCondition[], condition: ConfigurableOperation) {
  return definitions.find((d) => d.code === condition.code)
}

export function buildCheckRegistry(
  custom: PromotionProductCheck[] | undefined,
): Map<string, PromotionProductCheck> {
  const registry = new Map<string, PromotionProductCheck>()
  for (const check of [containsProductsCheck, ...(custom ?? [])]) {
    registry.set(check.code, check)
  }
  return registry
}

/**
 * Evaluates a promotion's conditions for one product, in order, stopping at the
 * first 'no-match'. A condition with no definition or no registered check is
 * 'unchecked'. A check that throws counts as 'no-match' and is logged.
 */
export async function evaluateConditions(input: {
  ctx: RequestContext
  injector: Injector
  productId: ID
  conditions: ConfigurableOperation[]
  definitions: PromotionCondition[]
  registry: Map<string, PromotionProductCheck>
}): Promise<ConditionResult[]> {
  const { ctx, injector, productId, conditions, definitions, registry } = input
  const results: ConditionResult[] = []
  for (const condition of conditions) {
    const definition = findDefinition(definitions, condition)
    const check = registry.get(condition.code)
    if (!definition || !check) {
      results.push('unchecked')
      continue
    }
    let matched: boolean
    try {
      const args = (definition as unknown as ArgsParser).argsArrayToHash(condition.args)
      matched = await check.matches({ ctx, injector, productId, args })
    } catch (error) {
      Logger.error(
        `Product check for promotion condition "${condition.code}" failed: ${error instanceof Error ? error.message : String(error)}`,
        loggerCtx,
      )
      matched = false
    }
    if (!matched) {
      results.push('no-match')
      break
    }
    results.push('match')
  }
  return results
}

export function uncheckedConditionCodes(
  conditions: ConfigurableOperation[],
  definitions: PromotionCondition[],
  registry: Map<string, PromotionProductCheck>,
): string[] {
  return conditions
    .filter((c) => !findDefinition(definitions, c) || !registry.has(c.code))
    .map((c) => c.code)
}
