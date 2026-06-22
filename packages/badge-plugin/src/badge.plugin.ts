import { PluginCommonModule, VendurePlugin } from '@vendure/core'
import { adminApiExtensions, shopApiExtensions } from './api/api-extensions'
import { BadgeAdminResolver } from './api/admin.resolver'

import { PLUGIN_INIT_OPTIONS } from './constants'
import { Badge } from './entity/badge.entity'
import { AdminUiExtension } from '@vendure/ui-devkit/compiler'
import { join } from 'path'
import { BadgeService } from './service/badge.service'
import {
  BadgeShopResolver,
  ProductEntityResolver,
  ProductVariantEntityResolver,
  SearchResultEntityResolver,
} from './api/shop.resolver'

export interface BadgePluginOptions {
  availablePositions?: string[]
}

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [
    {
      provide: PLUGIN_INIT_OPTIONS,
      useFactory: () => BadgePlugin.options,
    },
    BadgeService,
  ],
  shopApiExtensions: {
    schema: shopApiExtensions,
    resolvers: [
      BadgeShopResolver,
      ProductEntityResolver,
      SearchResultEntityResolver,
      ProductVariantEntityResolver,
    ],
  },
  adminApiExtensions: {
    schema: adminApiExtensions,
    resolvers: [BadgeAdminResolver],
  },
  entities: [Badge],
  dashboard: './dashboard/index.tsx',

  compatibility: '^3.0.0',
})
export class BadgePlugin {
  static options: BadgePluginOptions = {
    availablePositions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
  }

  static init(options?: BadgePluginOptions) {
    if (options) {
      this.options = options
    }
    return BadgePlugin
  }

  static ui: AdminUiExtension = {
    extensionPath: join(__dirname, 'ui'),
    translations: {
      en: join(__dirname, 'ui/translations/en.json'),
      sv: join(__dirname, 'ui/translations/sv.json'),
    },
    routes: [{ route: 'badges', filePath: 'routes.ts' }],
    providers: ['providers.ts'],
    //   ngModules: [
    //     {
    //       type: 'lazy',
    //       route: 'badges',
    //       ngModuleFileName: 'badge.module.ts',
    //       ngModuleName: 'BadgeModule',
    //     },
    //     {
    //       type: 'shared',
    //       ngModuleFileName: 'badge-nav.module.ts',
    //       ngModuleName: 'BadgesNavModule',
    //     },
    //   ],
  }
}
