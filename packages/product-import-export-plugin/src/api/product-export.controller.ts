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
import { existsSync, createReadStream, promises } from 'fs'
import * as path from 'path'
import { PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS } from '../constants'
import { ExportStorageOptions, PluginInitOptions } from '../types'
import { GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import {
  buildExportObjectKey,
  createS3Client,
  isS3Storage,
} from '../services/export-storage.util'

@Controller('product-export')
export class ProductExportController {
  constructor(
    @Inject(PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS) private options: PluginInitOptions,
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
      const channelToken = ctx.channel.token
      const storage = this.getExportStorageOptions()

      if (isS3Storage(storage)) {
        const client = createS3Client(storage)
        const key = buildExportObjectKey(storage, channelToken, fileName)
        const result = await client.send(
          new GetObjectCommand({
            Bucket: storage.bucket,
            Key: key,
          }),
        )

        if (!result.Body) {
          throw new UnprocessableEntityException('File not found')
        }

        const sanitizedFileName = this.sanitizeFileName(fileName)
        res.set({
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${sanitizedFileName}"`,
        })

        ;(result.Body as NodeJS.ReadableStream).pipe(res)
      } else {
        const exportsDir = path.join(process.cwd(), 'static', 'exports', channelToken)
        const filePath = path.join(exportsDir, fileName)

        if (!filePath.startsWith(exportsDir)) {
          throw new UnprocessableEntityException('Invalid file path')
        }

        if (!existsSync(filePath)) {
          throw new UnprocessableEntityException('File not found')
        }

        const sanitizedFileName = this.sanitizeFileName(fileName)
        res.set({
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${sanitizedFileName}"`,
        })

        const fileStream = createReadStream(filePath)
        fileStream.pipe(res)
      }
    } catch (e: any) {
      throw new UnprocessableEntityException(e.message)
    }
  }

  @Delete('delete/:fileName')
  async deleteExport(@Ctx() ctx: RequestContext, @Param('fileName') fileName: string) {
    try {
      const channelToken = ctx.channel.token
      const storage = this.getExportStorageOptions()

      if (isS3Storage(storage)) {
        const client = createS3Client(storage)
        const key = buildExportObjectKey(storage, channelToken, fileName)

        await client.send(
          new DeleteObjectCommand({
            Bucket: storage.bucket,
            Key: key,
          }),
        )
      } else {
        const exportsDir = path.join(process.cwd(), 'static', 'exports', channelToken)
        const filePath = path.join(exportsDir, fileName)

        if (!filePath.startsWith(exportsDir)) {
          throw new UnprocessableEntityException('Invalid file path')
        }

        if (!existsSync(filePath)) {
          throw new UnprocessableEntityException('File not found')
        }

        await promises.unlink(filePath)
      }

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
      const channelToken = ctx.channel.token
      const storage = this.getExportStorageOptions()

      if (isS3Storage(storage)) {
        const client = createS3Client(storage)
        const prefix = buildExportObjectKey(storage, channelToken, '')
        const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}`

        const result = await client.send(
          new ListObjectsV2Command({
            Bucket: storage.bucket,
            Prefix: normalizedPrefix,
          }),
        )

        const contents = result.Contents || []

        const fileList = contents
          .filter((object) => {
            if (!object.Key) {
              return false
            }

            return object.Key.endsWith('.csv') && !object.Key.endsWith('.tmp')
          })
          .map((object) => {
            const key = object.Key as string
            const segments = key.split('/')
            const file = segments[segments.length - 1]

            return {
              fileName: file,
              size: object.Size ?? 0,
              created: object.LastModified ?? new Date(),
              modified: object.LastModified ?? new Date(),
            }
          })

        return fileList.sort((a, b) => b.created.getTime() - a.created.getTime())
      } else {
        const exportsDir = path.join(process.cwd(), 'static', 'exports', channelToken)
        if (!existsSync(exportsDir)) {
          return []
        }

        const files = await promises.readdir(exportsDir)

        const fileList = await Promise.all(
          files
            .filter((file) => file.endsWith('.csv') && !file.endsWith('.tmp'))
            .map(async (file) => {
              const filePath = path.join(exportsDir, file)
              const stats = await promises.stat(filePath)
              return {
                fileName: file,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
              }
            }),
        )
        return fileList.sort((a, b) => b.created.getTime() - a.created.getTime())
      }
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
  private getExportStorageOptions(): ExportStorageOptions | undefined {
    if (!this.options.exportOptions) {
      return undefined
    }

    return this.options.exportOptions.storage
  }
}
