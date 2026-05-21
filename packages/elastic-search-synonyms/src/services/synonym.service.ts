import { Injectable, Inject } from '@nestjs/common'
import { IsNull, Repository } from 'typeorm'
import { SynonymGroup, CreateSynonymGroupInput, UpdateSynonymGroupInput } from '../types'
import {
  RequestContext,
  ID,
  PaginatedList,
  ListQueryBuilder,
  ListQueryOptions,
  TransactionalConnection,
} from '@vendure/core'
import { SynonymGroup as SynonymEntity } from '../entity/synonym-group.entity'
import { ElasticSynonymsService } from './elastic-synonyms.service'
import { PluginInitOptions } from '../types'
import { ELASTIC_SEARCH_SYNONYMS_OPTIONS } from '../constants'
import { toDto, normalizeSynonymsInput, validateSynonymsConstraints } from '../utils/synonym.helper'
import { DeletionResponse, DeletionResult } from '../gql/generated'

@Injectable()
export class SynonymService {
  constructor(
    private connection: TransactionalConnection,
    private elasticSynonymsService: ElasticSynonymsService,
    private listQueryBuilder: ListQueryBuilder,
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

    return this.persistAndSyncToElasticsearch(ctx, async (repo) => {
      const synonym = repo.create({
        synonyms: normalized.join(', '),
        languageCode: ctx.languageCode,
        channels: [{ id: ctx.channelId } as any],
      })
      return repo.save(synonym)
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
      synonym.synonyms = normalized.join(', ')
      return repo.save(synonym)
    })
  }

  async softDelete(ctx: RequestContext, id: ID): Promise<DeletionResponse> {
    return this.connection.withTransaction(ctx, async (txCtx) => {
      const repo = this.connection.getRepository(txCtx, SynonymEntity)
      const synonym = await this.getEntityByIdForChannel(repo, txCtx, id)
      if (!synonym) {
        throw new Error(`Synonym with id ${id} not found`)
      }

      synonym.deletedAt = new Date()
      const result = await repo.save(synonym)

      if (!result) {
        return {
          result: DeletionResult.NOT_DELETED,
        }
      }

      await this.syncElasticsearchFromRepo(repo)
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

  async getAll(): Promise<string[]> {
    const repo = this.connection.getRepository(SynonymEntity)
    return this.getAllActiveSynonymLines(repo)
  }

  /**
   * Persists entity changes and syncs Elasticsearch inside one DB transaction.
   * If Elasticsearch sync fails, the transaction is rolled back so DB and ES stay aligned.
   */
  private async persistAndSyncToElasticsearch(
    ctx: RequestContext,
    work: (repo: Repository<SynonymEntity>) => Promise<SynonymEntity>,
  ): Promise<SynonymGroup> {
    return this.connection.withTransaction(ctx, async (txCtx) => {
      const repo = this.connection.getRepository(txCtx, SynonymEntity)
      const entity = await work(repo)
      await this.syncElasticsearchFromRepo(repo)
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

  private async syncElasticsearchFromRepo(repo: Repository<SynonymEntity>): Promise<void> {
    const synonyms = await this.getAllActiveSynonymLines(repo)
    await this.elasticSynonymsService.updateElasticsearchSynonyms(synonyms)
  }

  private async getAllActiveSynonymLines(repo: Repository<SynonymEntity>): Promise<string[]> {
    const synonyms = await repo
      .createQueryBuilder('synonym')
      .where('synonym.deletedAt IS NULL')
      .getMany()
    return synonyms.map((synonym) => synonym.synonyms)
  }
}
