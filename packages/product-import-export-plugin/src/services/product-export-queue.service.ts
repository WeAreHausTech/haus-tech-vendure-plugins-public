import { Injectable, OnModuleInit, Inject } from '@nestjs/common'
import {
  RequestContext,
  JobQueue,
  JobQueueService,
  SerializedRequestContext,
  ID,
  EventBus,
} from '@vendure/core'
import { PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS } from '../constants'
import { PluginInitOptions } from '../types'
import { ProductExportService } from './product-export.service'
import { ProductExportedEvent } from '../events/product-exported.event'
import * as path from 'path'

@Injectable()
export class ProductExportQueueService implements OnModuleInit {
  private productExportQueue: JobQueue<{
    ctx: SerializedRequestContext
    fileName: string
    customFields: string
    exportAssetsAs: 'url' | 'json'
    selectedExportFields: string
    allProducts: boolean
    selectedProductIds?: ID[]
  }>

  constructor(
    @Inject(PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS) private options: PluginInitOptions,
    private jobQueueService: JobQueueService,
    private productExportService: ProductExportService,
    private eventBus: EventBus,
  ) {}

  public async onModuleInit(): Promise<void> {
    this.productExportQueue = await this.jobQueueService.createQueue({
      name: 'product-export',
      process: async (job) => {
        try {
          const ctx = RequestContext.deserialize(job.data.ctx)
          let productIds: ID[] = []

          if (job.data.allProducts) {
            productIds = await this.productExportService.getAllProductIds(ctx)
          } else if (job.data.selectedProductIds) {
            productIds = job.data.selectedProductIds
          } else {
            throw new Error('No products to export')
          }

          const filePath = await this.productExportService.createExportFile(
            ctx,
            productIds,
            job.data.fileName,
            job.data.customFields,
            job.data.exportAssetsAs,
            job.data.selectedExportFields,
          )

          const result = {
            filePath,
            fileName: path.basename(filePath),
            productCount: productIds.length,
          }

          const userEmail = ctx.session?.user?.identifier || ''

          const eventResult = {
            ...result,
            toEmail: userEmail,
          }
          // Publish event for email notification
          this.eventBus.publish(new ProductExportedEvent(ctx, eventResult))

          return result
        } catch (err: any) {
          console.error('Product export job failed:', err)
          throw err
        }
      },
    })
  }

  async triggerExport(
    ctx: RequestContext,
    fileName: string,
    customFields: string,
    exportAssetsAs: 'url' | 'json',
    selectedExportFields: string,
    allProducts = true,
  ) {
    return this.productExportQueue.add({
      ctx: ctx.serialize(),
      fileName,
      customFields,
      exportAssetsAs,
      selectedExportFields,
      allProducts,
    })
  }

  async triggerExportWithSelection(
    ctx: RequestContext,
    fileName: string,
    customFields: string,
    exportAssetsAs: 'url' | 'json',
    selectedExportFields: string,
    selectedProductIds: ID[],
  ) {
    return this.productExportQueue.add({
      ctx: ctx.serialize(),
      fileName,
      customFields,
      exportAssetsAs,
      selectedExportFields,
      allProducts: false,
      selectedProductIds,
    })
  }
}
