import type { LocaleDefaults } from './resolve-locale-action'

export const dashboardLocaleDefaultsDocument = /* GraphQL */ `
  query DashboardLocaleDefaults {
    dashboardLocaleDefaults {
      displayLanguage
      displayLocale
      contentLanguage
    }
  }
`

export interface DashboardLocaleDefaultsResult {
  dashboardLocaleDefaults: LocaleDefaults
}
