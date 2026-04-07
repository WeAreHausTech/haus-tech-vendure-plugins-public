import { Ctx, LanguageCode, RequestContext } from '@vendure/core'
import {
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors,
  Res,
  Body,
} from '@nestjs/common'
import { Response } from 'express'
import { FileInterceptor } from '@nestjs/platform-express'
import { PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS } from '../constants'
import { PluginInitOptions, UpdatingStrategy } from '../types'
import { ProductImportService } from '../services/product-import.service'

@Controller('product-import')
export class ProductImportController {
  constructor(
    @Inject(PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS) private options: PluginInitOptions,
    private service: ProductImportService,
  ) {}

  @Post('/upload')
  @UseInterceptors(FileInterceptor('file'))
  async updateProducts(
    @Ctx() ctx: RequestContext,
    @UploadedFile() file: Express.Multer.File,
    @Body('updateProductSlug')
    updateProductSlug: 'true' | 'false' = (this.options.importOptions.defaultOptions
      ?.updateProductSlug as any) || 'true',
    @Body('mainLanguage') mainLanguage: LanguageCode,
    @Body('updatingStrategy') updatingStrategy: UpdatingStrategy,
    @Res()
    res: Response,
  ) {
    if (!file) {
      return res.status(400).send('No file uploaded')
    }

    if (!mainLanguage) {
      return res.status(400).send('No mainLanguage provided')
    }

    try {
      await this.service.processFile(
        ctx,
        file,
        updateProductSlug === 'true',
        mainLanguage,
        updatingStrategy,
      )
      return res.status(200).send('File uploaded successfully')
    } catch (error: unknown) {
      return res.status(500).send((error as Error)?.message || 'Internal Server Error')
    }
  }
}
