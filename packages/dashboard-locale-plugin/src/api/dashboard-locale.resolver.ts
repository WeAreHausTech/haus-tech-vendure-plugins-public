import { Inject } from '@nestjs/common'
import { Query, Resolver } from '@nestjs/graphql'
import { Allow, Permission } from '@vendure/core'

import { DASHBOARD_LOCALE_PLUGIN_OPTIONS } from '../constants'
import { DashboardLocalePluginOptions } from '../types'

@Resolver()
export class DashboardLocaleAdminResolver {
  constructor(
    @Inject(DASHBOARD_LOCALE_PLUGIN_OPTIONS) private readonly options: DashboardLocalePluginOptions,
  ) {}

  @Query()
  @Allow(Permission.Authenticated)
  dashboardLocaleDefaults() {
    return {
      displayLanguage: this.options.displayLanguage,
      displayLocale: this.options.displayLocale ?? null,
      contentLanguage: this.options.contentLanguage ?? null,
    }
  }
}
