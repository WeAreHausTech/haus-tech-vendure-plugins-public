import { PluginCommonModule, SettingsStoreScopes, Type, VendurePlugin } from '@vendure/core'

import { dashboardLocaleAdminSchema } from './api/api-extensions'
import { DashboardLocaleAdminResolver } from './api/dashboard-locale.resolver'
import {
  APPLIED_DEFAULTS_FIELD,
  DASHBOARD_LOCALE_PLUGIN_OPTIONS,
  SETTINGS_STORE_NAMESPACE,
} from './constants'
import { DashboardLocalePluginOptions } from './types'

@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [
    {
      provide: DASHBOARD_LOCALE_PLUGIN_OPTIONS,
      useFactory: () => DashboardLocalePlugin.options,
    },
  ],
  adminApiExtensions: {
    schema: dashboardLocaleAdminSchema,
    resolvers: [DashboardLocaleAdminResolver],
  },
  configuration: config => {
    config.settingsStoreFields[SETTINGS_STORE_NAMESPACE] = [
      {
        name: APPLIED_DEFAULTS_FIELD,
        scope: SettingsStoreScopes.user,
      },
    ]
    return config
  },
  dashboard: './dashboard/index.tsx',
  compatibility: '^3.6.0',
})
/**
 * @description
 * Gives every administrator a configured default display language, region and content
 * language in the React Dashboard. The Dashboard itself always starts in English; this
 * plugin applies the configured values once per administrator, and remembers that it did
 * so, so a later choice made in the language dialog stands in every browser.
 *
 * Requires the `DashboardPlugin` from `@vendure/dashboard/plugin`.
 *
 * @example
 * ```ts
 * import { DashboardLocalePlugin } from '@haus-tech/dashboard-locale-plugin';
 *
 * export const config: VendureConfig = {
 *   plugins: [
 *     DashboardLocalePlugin.init({
 *       displayLanguage: LanguageCode.sv,
 *       displayLocale: 'SE',
 *       contentLanguage: LanguageCode.sv,
 *     }),
 *   ],
 * };
 * ```
 *
 * @category Plugin
 */
export class DashboardLocalePlugin {
  static options: DashboardLocalePluginOptions

  /**
   * @description
   * Initialise the plugin with the defaults to apply. Pass the returned class to the
   * `plugins` array of your `VendureConfig`.
   */
  static init(options: DashboardLocalePluginOptions): Type<DashboardLocalePlugin> {
    this.options = { ...options }
    return DashboardLocalePlugin
  }
}
