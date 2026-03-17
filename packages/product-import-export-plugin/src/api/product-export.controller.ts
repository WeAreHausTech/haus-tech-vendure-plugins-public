import { Ctx, RequestContext, ID } from '@vendure/core'
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Response } from 'express'
import { ProductExportService } from '../services/product-export.service'
import { ProductExportQueueService } from '../services/product-export-queue.service'
import { EXPORT_STORAGE_STRATEGY, PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS } from '../constants'
import { PluginInitOptions } from '../types'
import { ExportStorageStrategy } from '../services/export-storage/export-storage-strategy'

@Controller('product-export')
export class ProductExportController {
  constructor(
    @Inject(PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS) private options: PluginInitOptions,
    @Inject(EXPORT_STORAGE_STRATEGY) private exportStorageStrategy: ExportStorageStrategy,
    private productExportService: ProductExportService,
    private productExportQueueService: ProductExportQueueService,
  ) {}

  @Post('export')
  async exportProducts(
    @Ctx() ctx: RequestContext,
    @Res() res: Response,
    @Query('fileName') fileName: string,
    @Query('customFields') customFields: string,
    @Query('exportAssetsAs') exportAssetsAs: 'url' | 'json',
    @Query('selectedExportFields') selectedExportFields: string,
    @Body()
    selection: ID[],
  ) {
    try {
      if (
        !selection ||
        !Array.isArray(selection) ||
        selection.length === 0 ||
        !selectedExportFields
      ) {
        throw new UnprocessableEntityException('No products selected')
      }

      if (!fileName) {
        if (
          this.options.exportOptions.defaultFileName &&
          !this.options.exportOptions.defaultFileName.endsWith('.csv')
        ) {
          fileName = this.options.exportOptions.defaultFileName += '.csv'
        } else {
          fileName = this.options.exportOptions.defaultFileName || 'products_export.csv'
        }
      } else if (!fileName.endsWith('.csv')) {
        fileName += '.csv'
      }

      if (!customFields) {
        customFields = ''
      }

      const job = await this.productExportQueueService.triggerExportWithSelection(
        ctx,
        fileName,
        customFields,
        exportAssetsAs,
        selectedExportFields,
        selection,
      )

      if (!job || !job.id) {
        throw new UnprocessableEntityException('Failed to queue export job')
      }

      res.status(200).send({
        success: true,
        message: 'Export job queued successfully',
        jobId: job.id,
      })
    } catch (e: any) {
      throw new UnprocessableEntityException(e.message)
    }
  }

  @Post('export-all')
  async exportAllProducts(
    @Ctx() ctx: RequestContext,
    @Query('fileName') fileName: string,
    @Query('customFields') customFields: string,
    @Query('exportAssetsAs') exportAssetsAs: 'url' | 'json',
    @Query('selectedExportFields') selectedExportFields: string,
  ) {
    try {
      if (!selectedExportFields) {
        throw new UnprocessableEntityException('No export fields selected')
      }

      if (!fileName) {
        fileName = this.options.exportOptions.defaultFileName || 'all_products_export.csv'
      }
      if (!fileName.endsWith('.csv')) {
        fileName += '.csv'
      }

      if (!customFields) {
        customFields = ''
      }

      const job = await this.productExportQueueService.triggerExport(
        ctx,
        fileName,
        customFields,
        exportAssetsAs,
        selectedExportFields,
        true, // allProducts = true
      )

      return {
        success: true,
        message: 'Export job queued successfully',
        jobId: job.id,
      }
    } catch (e: any) {
      throw new UnprocessableEntityException(e.message)
    }
  }

  @Get('download/:fileName')
  async downloadExport(
    @Ctx() ctx: RequestContext,
    @Res() res: Response,
    @Param('fileName') fileName: string,
  ) {
    try {
      const sanitizedFileName = this.sanitizeFileName(fileName)
      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${sanitizedFileName}"`,
      })

      const stream = await this.exportStorageStrategy.getExportFileStream(ctx, fileName)
      stream.pipe(res)
    } catch (e: any) {
      throw new UnprocessableEntityException(e.message)
    }
  }

  @Delete('delete/:fileName')
  async deleteExport(@Ctx() ctx: RequestContext, @Param('fileName') fileName: string) {
    try {
      await this.exportStorageStrategy.deleteExportFile(ctx, fileName)

      return {
        success: true,
        message: 'File deleted successfully',
      }
    } catch (e: any) {
      throw new UnprocessableEntityException(e.message)
    }
  }

  @Post('custom-fields')
  async getCustomFields(@Ctx() ctx: RequestContext, @Body() ids: string[]) {
    return this.productExportService.getCustomFields(ctx, ids)
  }

  @Get('exported-files')
  async getExportFiles(@Ctx() ctx: RequestContext) {
    try {
      return await this.exportStorageStrategy.listExportFiles(ctx)
    } catch (e: any) {
      throw new UnprocessableEntityException(e.message)
    }
  }

  private sanitizeFileName(fileName: string): string {
    const cleaned = fileName.replace(/[\r\n"]/g, '')

    if (!cleaned || cleaned.trim().length === 0) {
      return 'export.csv'
    }

    return cleaned
  }
}
