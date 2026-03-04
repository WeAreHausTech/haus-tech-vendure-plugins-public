import { Ctx, RequestContext } from '@vendure/core'
import { Controller, Inject, Get } from '@nestjs/common'
import { PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS } from '../constants'
import { PluginInitOptions } from '../types'

@Controller('product-import-export')
export class ProductImportExportPluginController {
  constructor(@Inject(PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS) private options: PluginInitOptions) {}

  @Get('config')
  getConfig() {
    return this.options
  }

  @Get('channel')
  getChannel(@Ctx() ctx: RequestContext) {
    return ctx.channel
  }
}
