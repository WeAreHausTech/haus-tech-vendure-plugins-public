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

/**
 * @description
 * Options passed to {@link BadgePlugin}.init to configure badge behaviour.
 *
 * @category Options
 */
export interface BadgePluginOptions {
  /**
   * The set of positions a badge may be placed at. A badge whose position is not in
   * this list is rejected on create/update. Defaults to the four image corners.
   */
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

  compatibility: '^3.6.0',
})
/**
 * @description
 * Manages image badges (e.g. "New", "Sale") that are attached to collections and
 * inherited by every product in those collections. Badges are channel-aware and
 * exposed on `Product`, `ProductVariant`, and `SearchResult` via the Shop API.
 *
 * @example
 * ```ts
 * import { BadgePlugin } from '@haus-tech/badge-plugin'
 *
 * export const config = {
 *   plugins: [
 *     BadgePlugin.init({
 *       availablePositions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
 *     }),
 *   ],
 * }
 * ```
 *
 * @category Plugin
 */
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
  }
}
