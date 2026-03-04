import { Injectable, OnModuleInit, Inject } from '@nestjs/common'
import {
  RequestContext,
  JobQueue,
  JobQueueService,
  SerializedRequestContext,
  ImportProgress,
  SearchService,
  LanguageCode,
  EventBus,
  ProductEvent,
  Product,
  CollectionService,
  ProductService,
} from '@vendure/core'
import { PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS } from '../constants'
import { PluginInitOptions, UpdatingStrategy } from '../types'
import { ProductImporter } from '../providers/import-providers/product-importer'
import { omit } from 'lodash'

@Injectable()
export class ProductImportService implements OnModuleInit {
  private productImportQueue: JobQueue<{
    ctx: SerializedRequestContext
    fileContent: string
    updateProductSlug: boolean
    mainLanguage: LanguageCode
    updatingStrategy: UpdatingStrategy
  }>

  constructor(
    @Inject(PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS) private options: PluginInitOptions,
    private jobQueueService: JobQueueService,
    private productImporter: ProductImporter,
    private searchService: SearchService,
    private collectionService: CollectionService,
    private productService: ProductService,
    private eventBus: EventBus,
  ) {}

  public async onModuleInit(): Promise<void> {
    this.productImportQueue = await this.jobQueueService.createQueue({
      name: 'product-import',
      process: async (job) => {
        // Deserialize the RequestContext from the job data
        const ctx = RequestContext.deserialize(job.data.ctx)
        let jobResult: ImportProgress
        return new Promise((resolve, reject) => {
          this.productImporter
            .parseAndImport(
              job.data.fileContent,
              ctx,
              job.data.updateProductSlug,
              job.data.mainLanguage,
              job.data.updatingStrategy,
            )
            .subscribe({
              next: (result) => {
                const processedCount = result.processed
                const importedCount = result.imported
                const percentage = (importedCount / processedCount) * 100
                job.setProgress(percentage)
                jobResult = result
              },
              complete: async () => {
                // Hack for triggering apply-collection-filters job
                const firstProduct = await this.productService.findAll(ctx, {
                  take: 1,
                })

                this.eventBus.publish(new ProductEvent(ctx, firstProduct.items[0], 'updated'))

                // Reindex the search index
                await this.searchService.reindex(ctx)

                resolve(omit(jobResult, 'currentProduct'))
              },
              error: (err) => {
                reject(err)
              },
            })
        })
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
    const fileContent = file.buffer.toString('utf-8')

    return this.triggerProductImport(
      ctx,
      fileContent,
      updateProductSlug,
      mainLanguage,
      updatingStrategy,
    )
  }

  private triggerProductImport(
    ctx: RequestContext,
    fileContent: string,
    updateProductSlug: boolean,
    mainLanguage: LanguageCode,
    updatingStrategy: UpdatingStrategy,
  ) {
    return this.productImportQueue.add({
      ctx: ctx.serialize(),
      fileContent,
      updateProductSlug,
      mainLanguage,
      updatingStrategy,
    })
  }
}
