import { Inject, Injectable } from '@nestjs/common'
import { Client as ElasticsearchClient } from '@elastic/elasticsearch'
import type { SynonymsSynonymRule } from '@elastic/elasticsearch/lib/api/types'
import { Logger } from '@vendure/core'
import { DEFAULT_SYNONYMS_SET_ID, ELASTIC_SEARCH_SYNONYMS_OPTIONS, loggerCtx } from '../constants'
import { PluginInitOptions } from '../types'
const PLACEHOLDER_RULE: SynonymsSynonymRule = {
  id: 'placeholder',
  synonyms: '__placeholder__',
}

@Injectable()
export class ElasticSynonymsService {
  private readonly client: ElasticsearchClient
  private readonly synonymsSetId: string

  constructor(
    @Inject(ELASTIC_SEARCH_SYNONYMS_OPTIONS) private readonly options: PluginInitOptions,
  ) {
    const host = process.env.ELASTICSEARCH_HOST || 'http://localhost'
    const port = process.env.ELASTICSEARCH_PORT ? +process.env.ELASTICSEARCH_PORT : 9200
    this.synonymsSetId =
      options?.synonymsSetId || process.env.ELASTICSEARCH_SYNONYMS_SET || DEFAULT_SYNONYMS_SET_ID
    this.client = new ElasticsearchClient({ node: `${host}:${port}` })
  }

  async updateElasticsearchSynonyms(synonyms: string[]): Promise<void> {
    try {
      await this.waitForElasticsearch()

      const rules = this.buildRules(synonyms)

      await this.client.synonyms.putSynonym({
        id: this.synonymsSetId,
        synonyms_set: rules,
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      Logger.error(`[Synonyms] Failed to update synonyms set: ${message}`, loggerCtx)
      throw new Error(message || 'Failed to update Elasticsearch synonyms')
    }
  }

  private buildRules(synonyms: string[]): SynonymsSynonymRule[] {
    const cleaned = synonyms.map((line) => line.trim()).filter((line) => line.length > 0)

    if (cleaned.length === 0) {
      return [PLACEHOLDER_RULE]
    }

    return cleaned.map((synonymsLine, index) => ({
      id: `rule-${index + 1}`,
      synonyms: synonymsLine,
    }))
  }

  private async waitForElasticsearch(): Promise<void> {
    const maxAttempts = 30
    const delayMs = 50

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const isAlive = await this.client.ping()
        if (isAlive) {
          return
        }
      } catch {
        // Ignore and retry until max attempts
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt))
      }
    }

    throw new Error('Elasticsearch did not become ready within expected time')
  }
}
