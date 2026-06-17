import { ID } from '@vendure/core'
import { SynonymGroup } from '../types'
import { SynonymGroup as SynonymEntity } from '../entity/synonym-group.entity'

export function toDto(entity: SynonymEntity): SynonymGroup {
  return {
    id: entity.id as ID,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    languageCode: entity.languageCode,
    synonyms: entity.synonyms
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0),
  }
}

export function normalizeSynonymsInput(synonyms: string[]): string[] {
  const dedup = new Set(
    (synonyms || []).map((t: string) => (t ?? '').trim()).filter((t: string) => t.length > 0),
  )
  return Array.from(dedup)
}

export function validateSynonymsConstraints(
  synonyms: string[],
  maxTokensPerGroup = 128,
  maxGroupBytes = 16_000,
  maxTokenLength = 128,
): void {
  if (!Array.isArray(synonyms) || synonyms.length === 0) {
    throw new Error('At least one synonym is required')
  }

  if (synonyms.length > maxTokensPerGroup) {
    throw new Error(`Too many synonyms in one group (max ${maxTokensPerGroup})`)
  }

  for (const token of synonyms) {
    if (token.includes(',')) {
      throw new Error(
        `Synonym "${token.slice(0, 50)}" cannot contain a comma. Add one term at a time.`,
      )
    }
    if (token.length > maxTokenLength) {
      throw new Error(
        `Synonym "${token.slice(0, 50)}…" is too long (max ${maxTokenLength} characters)`,
      )
    }
  }

  const bytes = Buffer.byteLength(synonyms.join(', '), 'utf8')
  if (bytes > maxGroupBytes) {
    throw new Error(
      `Synonym group is too large (${bytes} bytes). Reduce number/length of synonyms.`,
    )
  }
}
