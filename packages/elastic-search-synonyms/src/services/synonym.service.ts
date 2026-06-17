import { Injectable, Inject } from '@nestjs/common'
import { IsNull, Repository } from 'typeorm'
import { SynonymGroup, CreateSynonymGroupInput, UpdateSynonymGroupInput } from '../types'
import {
  ChannelService,
  ID,
  ListQueryBuilder,
  ListQueryOptions,
  Logger,
  PaginatedList,
  RequestContext,
  TransactionalConnection,
} from '@vendure/core'
import { SynonymGroup as SynonymEntity } from '../entity/synonym-group.entity'
import { ElasticSynonymsService } from './elastic-synonyms.service'
import { PluginInitOptions } from '../types'
import { ELASTIC_SEARCH_SYNONYMS_OPTIONS, loggerCtx } from '../constants'
import { toDto, normalizeSynonymsInput, validateSynonymsConstraints } from '../utils/synonym.helper'
import {
  DEFAULT_SYNONYMS_SET_ID_PATTERN,
  resolveSynonymsSetId,
} from '../utils/synonyms-set-id.helper'
import { DeletionResponse, DeletionResult } from '../gql/generated'

type PersistResult = {
  entity: SynonymEntity
  channelIds: ID[]
}

/**
 * @description
 * Manages synonym groups in the database (CRUD, channel association, soft-delete) and
 * keeps the configured Elasticsearch synonym set(s) in sync via {@link ElasticSynonymsService}.
 *
 * @category Services
 */
@Injectable()
export class SynonymService {
  /** @internal */
  constructor(
    private connection: TransactionalConnection,
    private elasticSynonymsService: ElasticSynonymsService,
    private listQueryBuilder: ListQueryBuilder,
    private channelService: ChannelService,
    @Inject(ELASTIC_SEARCH_SYNONYMS_OPTIONS) private readonly options: PluginInitOptions,
  ) {}

  async findAll(
    ctx: RequestContext,
    options?: ListQueryOptions<SynonymEntity>,
  ): Promise<PaginatedList<SynonymGroup>> {
    return this.listQueryBuilder
      .build(SynonymEntity, options, {
        ctx,
        channelId: ctx.channelId,
        where: { deletedAt: IsNull() },
        customPropertyMap: {
          synonyms: 'synonyms',
        },
      })
      .getManyAndCount()
      .then(async ([synonyms, totalItems]) => {
        return { items: synonyms.map((e) => toDto(e)), totalItems }
      })
  }

  async create(ctx: RequestContext, input: CreateSynonymGroupInput): Promise<SynonymGroup> {
    const normalized = normalizeSynonymsInput(input.synonyms)
    validateSynonymsConstraints(
      normalized,
      this.options.maxTokensPerGroup,
      this.options.maxGroupBytes,
      this.options.maxTokenLength,
    )

    if (!ctx.channelId) {
      throw new Error('Channel context is required to create a synonym group')
    }

    return this.persistAndSyncToElasticsearch(ctx, async (repo) => {
      const synonym = repo.create({
        synonyms: normalized.join(', '),
        languageCode: ctx.languageCode,
        channels: [{ id: ctx.channelId } as any],
      })
      const entity = await repo.save(synonym)
      return { entity, channelIds: [ctx.channelId] }
    })
  }

  async update(ctx: RequestContext, input: UpdateSynonymGroupInput): Promise<SynonymGroup> {
    const normalized = normalizeSynonymsInput(input.synonyms)
    validateSynonymsConstraints(
      normalized,
      this.options.maxTokensPerGroup,
      this.options.maxGroupBytes,
      this.options.maxTokenLength,
    )

    return this.persistAndSyncToElasticsearch(ctx, async (repo) => {
      const synonym = await this.getEntityByIdForChannel(repo, ctx, input.id)
      if (!synonym) {
        throw new Error(`Synonym with id ${input.id} not found`)
      }

      const channelIds = await this.getChannelIdsForEntity(repo, synonym.id)
      synonym.synonyms = normalized.join(', ')
      const entity = await repo.save(synonym)
      return { entity, channelIds }
    })
  }

  async softDelete(ctx: RequestContext, id: ID): Promise<DeletionResponse> {
    return this.connection.withTransaction(ctx, async (txCtx) => {
      const repo = this.connection.getRepository(txCtx, SynonymEntity)
      const synonym = await this.getEntityByIdForChannel(repo, txCtx, id)
      if (!synonym) {
        throw new Error(`Synonym with id ${id} not found`)
      }

      const channelIds = await this.getChannelIdsForEntity(repo, synonym.id)
      synonym.deletedAt = new Date()
      const result = await repo.save(synonym)

      if (!result) {
        return {
          result: DeletionResult.NOT_DELETED,
        }
      }

      await this.syncElasticsearchForChannels(repo, txCtx, channelIds)
      return {
        result: DeletionResult.DELETED,
      }
    })
  }

  async findOne(ctx: RequestContext, id: ID): Promise<SynonymGroup | null> {
    const repo = this.connection.getRepository(ctx, SynonymEntity)
    const entity = await this.getEntityByIdForChannel(repo, ctx, id)
    return entity ? toDto(entity) : null
  }

  /**
   * Syncs synonym rules to Elasticsearch for all channels (startup) or one global set (legacy mode).
   */
  async syncAllToElasticsearch(ctx: RequestContext): Promise<number> {
    const repo = this.connection.getRepository(ctx, SynonymEntity)

    if (!this.options.channelSpecificSynonyms) {
      const synonyms = await this.getAllActiveSynonymLines(repo)
      await this.elasticSynonymsService.updateElasticsearchSynonyms(synonyms)
      return synonyms.length
    }

    const channels = await this.getAllChannels(ctx)
    const updates = await Promise.all(
      channels.map(async (channel) => ({
        synonymsSetId: resolveSynonymsSetId(this.getSynonymsSetIdPattern(), channel),
        synonyms: await this.getActiveSynonymLinesForChannel(repo, channel.id),
      })),
    )

    await this.elasticSynonymsService.updateSynonymsSets(updates)
    return updates.reduce((count, update) => count + update.synonyms.length, 0)
  }

  /**
   * Persists entity changes and syncs Elasticsearch inside one DB transaction.
   * If Elasticsearch sync fails, the transaction is rolled back so DB and ES stay aligned.
   */
  private async persistAndSyncToElasticsearch(
    ctx: RequestContext,
    work: (repo: Repository<SynonymEntity>) => Promise<PersistResult>,
  ): Promise<SynonymGroup> {
    return this.connection.withTransaction(ctx, async (txCtx) => {
      const repo = this.connection.getRepository(txCtx, SynonymEntity)
      const { entity, channelIds } = await work(repo)
      await this.syncElasticsearchForChannels(repo, txCtx, channelIds)
      return toDto(entity)
    })
  }

  /**
   * Loads a non-deleted synonym group only when it is assigned to `ctx.channel`.
   */
  private async getEntityByIdForChannel(
    repo: Repository<SynonymEntity>,
    ctx: RequestContext,
    id: ID,
  ): Promise<SynonymEntity | null> {
    const channelId = ctx.channelId
    if (!channelId) {
      return null
    }

    return repo
      .createQueryBuilder('synonym')
      .innerJoin('synonym.channels', 'channel', 'channel.id = :channelId', { channelId })
      .where('synonym.id = :id', { id })
      .andWhere('synonym.deletedAt IS NULL')
      .getOne()
  }

  private async getChannelIdsForEntity(
    repo: Repository<SynonymEntity>,
    entityId: ID,
  ): Promise<ID[]> {
    const entity = await repo.findOne({
      where: { id: entityId },
      relations: ['channels'],
    })
    return entity?.channels?.map((channel) => channel.id) ?? []
  }

  private async syncElasticsearchForChannels(
    repo: Repository<SynonymEntity>,
    ctx: RequestContext,
    channelIds: ID[],
  ): Promise<void> {
    if (!this.options.channelSpecificSynonyms) {
      const synonyms = await this.getAllActiveSynonymLines(repo)
      await this.elasticSynonymsService.updateElasticsearchSynonyms(synonyms)
      return
    }

    const uniqueChannelIds = [...new Set(channelIds.map(String))].map((id) => id as ID)
    const updates = []

    for (const channelId of uniqueChannelIds) {
      const channel = await this.channelService.findOne(ctx, channelId)
      if (!channel) {
        Logger.warn(
          `[Synonyms] Skipping Elasticsearch sync for unknown channel id ${channelId}`,
          loggerCtx,
        )
        continue
      }

      updates.push({
        synonymsSetId: resolveSynonymsSetId(this.getSynonymsSetIdPattern(), channel),
        synonyms: await this.getActiveSynonymLinesForChannel(repo, channel.id),
      })
    }

    await this.elasticSynonymsService.updateSynonymsSets(updates)
  }

  private getSynonymsSetIdPattern(): string {
    return this.options.synonymsSetIdPattern ?? DEFAULT_SYNONYMS_SET_ID_PATTERN
  }

  private async getAllChannels(ctx: RequestContext) {
    const result = await this.channelService.findAll(ctx, { take: 1000 })
    return result.items
  }

  private async getActiveSynonymLinesForChannel(
    repo: Repository<SynonymEntity>,
    channelId: ID,
  ): Promise<string[]> {
    const synonyms = await repo
      .createQueryBuilder('synonym')
      .innerJoin('synonym.channels', 'channel', 'channel.id = :channelId', { channelId })
      .where('synonym.deletedAt IS NULL')
      .getMany()

    return synonyms.map((synonym) => synonym.synonyms)
  }

  private async getAllActiveSynonymLines(repo: Repository<SynonymEntity>): Promise<string[]> {
    const synonyms = await repo
      .createQueryBuilder('synonym')
      .where('synonym.deletedAt IS NULL')
      .getMany()
    return synonyms.map((synonym) => synonym.synonyms)
  }
}
