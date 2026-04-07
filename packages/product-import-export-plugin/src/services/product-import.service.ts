import { OnModuleInit } from '@nestjs/common'
import { Injectable, Inject } from '@nestjs/common'
import {
  JobQueue,
  JobQueueService,
  SerializedRequestContext,
  ImportProgress,
  SearchService,
  LanguageCode,
  EventBus,
  ProductService,
  Logger,
} from '@vendure/core'
import { RequestContext, ProductEvent } from '@vendure/core'
import { IMPORT_JOB_STORAGE_STRATEGY } from '../constants'
import { UpdatingStrategy } from '../types'
import { ProductImporter } from '../providers/import-providers/product-importer'
import { omit } from 'lodash'
import { ImportJobStorageStrategy } from './import-storage/import-job-storage-strategy'

@Injectable()
export class ProductImportService implements OnModuleInit {
  private readonly loggerCtx = 'ProductImportService'
  private productImportQueue: JobQueue<{
    ctx: SerializedRequestContext
    storageKey: string
    fileName: string
    updateProductSlug: boolean
    mainLanguage: LanguageCode
    updatingStrategy: UpdatingStrategy
  }>

  constructor(
    @Inject(IMPORT_JOB_STORAGE_STRATEGY) private importJobStorageStrategy: ImportJobStorageStrategy,
    private jobQueueService: JobQueueService,
    private productImporter: ProductImporter,
    private searchService: SearchService,
    private productService: ProductService,
    private eventBus: EventBus,
  ) {}

  public async onModuleInit(): Promise<void> {
    this.productImportQueue = await this.jobQueueService.createQueue({
      name: 'product-import',
      process: async (job) => {
        const ctx = RequestContext.deserialize(job.data.ctx)
        let jobResult: ImportProgress | undefined
        try {
          const fileContent = await this.importJobStorageStrategy.getImportFileContent(
            ctx,
            job.data.storageKey,
          )
          return await new Promise<ImportProgress>((resolve, reject) => {
            this.productImporter
              .parseAndImport(
                fileContent,
                ctx,
                job.data.updateProductSlug,
                job.data.mainLanguage,
                job.data.updatingStrategy,
              )
              .subscribe({
                next: (result) => {
                  const processedCount = result.processed || 1
                  const importedCount = result.imported || 0
                  const percentage = (importedCount / processedCount) * 100
                  job.setProgress(percentage)
                  jobResult = result
                },
                complete: () => {
                  resolve(jobResult ?? { imported: 0, processed: 0, errors: [], currentProduct: '' })
                },
                error: (err) => {
                  reject(err)
                },
              })
          }).then(async (result) => {
            await this.runPostImportTasks(ctx, result)
            return omit(result, 'currentProduct') as ImportProgress
          })
        } finally {
          await this.cleanupStoredImportFile(ctx, job.data.storageKey)
        }
      },
    })
  }

  async processFile(
    ctx: RequestContext,
    file: Express.Multer.File,
    updateProductSlug: boolean,
    mainLanguage: LanguageCode,
    updatingStrategy: UpdatingStrategy,
  ) {
    const storageKey = await this.importJobStorageStrategy.storeImportFile(ctx, {
      originalname: file.originalname,
      buffer: file.buffer,
    })

    return this.triggerProductImport(
      ctx,
      storageKey,
      file.originalname,
      updateProductSlug,
      mainLanguage,
      updatingStrategy,
    )
  }

  private async cleanupStoredImportFile(ctx: RequestContext, storageKey: string): Promise<void> {
    try {
      await this.importJobStorageStrategy.deleteImportFile(ctx, storageKey)
    } catch (error) {
      Logger.warn(
        `Failed to cleanup stored import file "${storageKey}": ${(error as Error).message}`,
        this.loggerCtx,
      )
    }
  }

  private async runPostImportTasks(ctx: RequestContext, result: ImportProgress): Promise<void> {
    if (result.imported <= 0) {
      return
    }
    const firstProduct = await this.productService.findAll(ctx, { take: 1 })
    const firstItem = firstProduct.items[0]
    if (firstItem) {
      this.eventBus.publish(new ProductEvent(ctx, firstItem, 'updated'))
    } else {
      Logger.warn('Skipping ProductEvent publish because no product was found', this.loggerCtx)
    }
    await this.searchService.reindex(ctx)
  }

  private triggerProductImport(
    ctx: RequestContext,
    storageKey: string,
    fileName: string,
    updateProductSlug: boolean,
    mainLanguage: LanguageCode,
    updatingStrategy: UpdatingStrategy,
  ) {
    return this.productImportQueue.add({
      ctx: ctx.serialize(),
      storageKey,
      fileName,
      updateProductSlug,
      mainLanguage,
      updatingStrategy,
    })
  }
}
