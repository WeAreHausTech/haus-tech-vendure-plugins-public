import gql from 'graphql-tag'

export const dashboardLocaleAdminSchema = gql`
  type DashboardLocaleDefaults {
    displayLanguage: LanguageCode!
    displayLocale: String
    contentLanguage: LanguageCode
  }

  extend type Query {
    dashboardLocaleDefaults: DashboardLocaleDefaults!
  }
`
