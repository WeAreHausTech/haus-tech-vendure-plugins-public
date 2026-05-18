import { Injectable, Inject } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { SynonymGroup, CreateSynonymGroupInput, UpdateSynonymGroupInput } from '../types'
import {
  RequestContext,
  ID,
  PaginatedList,
  ListQueryBuilder,
  ListQueryOptions,
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
    @InjectRepository(SynonymEntity)
    private synonymRepository: Repository<SynonymEntity>,
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
    const synonym = this.synonymRepository.create({
      synonyms: normalized.join(', '),
      languageCode: ctx.languageCode,
      channels: [{ id: ctx.channelId } as any],
    })

    const savedSynonym = await this.synonymRepository.save(synonym)

    const synonyms = await this.getAll()
    await this.elasticSynonymsService.updateElasticsearchSynonyms(synonyms)

    return toDto(savedSynonym)
  }

  async update(ctx: RequestContext, input: UpdateSynonymGroupInput): Promise<SynonymGroup> {
    const synonym = await this.getEntityById(ctx, input.id)
    if (!synonym) {
      throw new Error(`Synonym with id ${input.id} not found`)
    }

    const normalized = normalizeSynonymsInput(input.synonyms)
    validateSynonymsConstraints(
      normalized,
      this.options.maxTokensPerGroup,
      this.options.maxGroupBytes,
      this.options.maxTokenLength,
    )
    synonym.synonyms = normalized.join(', ')
    const updated = await this.synonymRepository.save(synonym)

    const synonyms = await this.getAll()
    await this.elasticSynonymsService.updateElasticsearchSynonyms(synonyms)

    return toDto(updated)
  }

  async softDelete(ctx: RequestContext, id: ID): Promise<DeletionResponse> {
    const synonym = await this.getEntityById(ctx, id)
    if (!synonym) {
      throw new Error(`Synonym with id ${id} not found`)
    }

    synonym.deletedAt = new Date()
    const result = await this.synonymRepository.save(synonym)

    if (result) {
      const synonyms = await this.getAll()
      await this.elasticSynonymsService.updateElasticsearchSynonyms(synonyms)
      return {
        result: DeletionResult.DELETED,
      }
    }
    return {
      result: DeletionResult.NOT_DELETED,
    }
  }

  private async getEntityById(ctx: RequestContext, id: ID): Promise<SynonymEntity | null> {
    return this.synonymRepository.findOne({
      where: { id, deletedAt: IsNull() },
    })
  }

  async findOne(ctx: RequestContext, id: ID): Promise<SynonymGroup | null> {
    const entity = await this.getEntityById(ctx, id)
    return entity ? toDto(entity) : null
  }

  async getAll(): Promise<string[]> {
    const synonyms = await this.synonymRepository
      .createQueryBuilder('synonym')
      .where('synonym.deletedAt IS NULL')
      .getMany()
    return synonyms.map((synonym) => synonym.synonyms)
  }
}
