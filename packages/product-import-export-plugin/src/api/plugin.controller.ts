import { Allow, Ctx, Permission, RequestContext } from '@vendure/core'
import { Controller, Inject, Get } from '@nestjs/common'
import { PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS } from '../constants'
import { PluginInitOptions } from '../types'

/**
 * The subset of plugin options that the admin UIs need. This is an explicit
 * allow-list: the raw options object carries storage strategies (and therefore
 * cloud credentials) and MUST never be serialized to a client.
 */
export type PublicPluginConfig = {
  importOptions: {
    visibleOptions?: PluginInitOptions['importOptions']['visibleOptions']
    defaultOptions: {
      updateProductSlug?: boolean
      restoreSoftDeleted?: boolean
    }
  }
  exportOptions: {
    defaultFileName?: string
    exportAssetsAsOptions?: PluginInitOptions['exportOptions']['exportAssetsAsOptions']
    defaultExportAssetsAs?: PluginInitOptions['exportOptions']['defaultExportAssetsAs']
    defaultExportFields?: PluginInitOptions['exportOptions']['defaultExportFields']
    requiredExportFields?: PluginInitOptions['exportOptions']['requiredExportFields']
    customExportColumns?: Array<{ name: string }>
  }
}

export type PublicChannelInfo = {
  code: string
  token: string
  defaultLanguageCode: string
  availableLanguageCodes: string[]
}

export function toPublicPluginConfig(options: PluginInitOptions): PublicPluginConfig {
  const { importOptions, exportOptions } = options
  return {
    importOptions: {
      visibleOptions: importOptions?.visibleOptions,
      // Pick fields one by one: the ImportOptions type also permits storage
      // strategies inside defaultOptions, so a raw copy could leak credentials.
      defaultOptions: {
        updateProductSlug: importOptions?.defaultOptions?.updateProductSlug,
        restoreSoftDeleted: importOptions?.defaultOptions?.restoreSoftDeleted,
      },
    },
    exportOptions: {
      defaultFileName: exportOptions?.defaultFileName,
      exportAssetsAsOptions: exportOptions?.exportAssetsAsOptions,
      defaultExportAssetsAs: exportOptions?.defaultExportAssetsAs,
      defaultExportFields: exportOptions?.defaultExportFields,
      requiredExportFields: exportOptions?.requiredExportFields,
      customExportColumns: exportOptions?.customExportColumns?.map(({ name }) => ({ name })),
    },
  }
}

@Controller('product-import-export')
export class ProductImportExportPluginController {
  constructor(@Inject(PRODUCT_IMPORT_EXPORT_PLUGIN_OPTIONS) private options: PluginInitOptions) {}

  @Get('config')
  @Allow(Permission.ReadCatalog, Permission.ReadProduct)
  getConfig(): PublicPluginConfig {
    return toPublicPluginConfig(this.options)
  }

  @Get('channel')
  @Allow(Permission.ReadCatalog, Permission.ReadProduct)
  getChannel(@Ctx() ctx: RequestContext): PublicChannelInfo {
    const { code, token, defaultLanguageCode, availableLanguageCodes } = ctx.channel
    return { code, token, defaultLanguageCode, availableLanguageCodes }
  }
}
