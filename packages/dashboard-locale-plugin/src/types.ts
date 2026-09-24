import { LanguageCode } from '@vendure/core'

/**
 * @description
 * Options passed to {@link DashboardLocalePlugin}.init. The values are applied once to every
 * administrator the next time they open the Dashboard. A later choice made by the
 * administrator in the language dialog stands.
 *
 * @category Options
 */
export interface DashboardLocalePluginOptions {
  /** The Dashboard UI language, e.g. `LanguageCode.sv`. */
  displayLanguage: LanguageCode
  /**
   * The region used for formatting dates, numbers and prices, e.g. `'SE'`.
   * Left untouched when not set.
   */
  displayLocale?: string
  /**
   * The language in which translatable content (products, collections, ...) is shown and
   * edited. Must be one of the active channel's available languages. Left untouched when not set.
   */
  contentLanguage?: LanguageCode
}
