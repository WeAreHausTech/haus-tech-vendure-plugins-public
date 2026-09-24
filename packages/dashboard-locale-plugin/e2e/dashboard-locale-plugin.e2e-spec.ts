import path from 'path'
import { LanguageCode, mergeConfig } from '@vendure/core'
import { DashboardPlugin } from '@vendure/dashboard/plugin'
import {
  createTestEnvironment,
  registerInitializer,
  SqljsInitializer,
  testConfig,
} from '@vendure/testing'
import gql from 'graphql-tag'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DashboardLocalePlugin } from '../src/dashboard-locale.plugin'
import { APPLIED_DEFAULTS_KEY } from '../src/constants'
import { initialData } from './fixtures/initial-data'

registerInitializer('sqljs', new SqljsInitializer(path.join(__dirname, '__data__')))

const GET_DEFAULTS = gql`
  query DashboardLocaleDefaults {
    dashboardLocaleDefaults {
      displayLanguage
      displayLocale
      contentLanguage
    }
  }
`

const GET_SETTING = gql`
  query GetSettingsStoreValue($key: String!) {
    getSettingsStoreValue(key: $key)
  }
`

const SET_SETTING = gql`
  mutation SetSettingsStoreValue($input: SettingsStoreInput!) {
    setSettingsStoreValue(input: $input) {
      key
      result
      error
    }
  }
`

const GET_SUPERADMIN_ROLE = gql`
  query Roles {
    roles {
      items {
        id
        code
      }
    }
  }
`

const CREATE_ADMINISTRATOR = gql`
  mutation CreateAdministrator($input: CreateAdministratorInput!) {
    createAdministrator(input: $input) {
      id
    }
  }
`

describe('DashboardLocalePlugin e2e', () => {
  const { server, adminClient } = createTestEnvironment(
    mergeConfig(testConfig, {
      apiOptions: { port: 3062 },
      plugins: [
        DashboardPlugin.init({ route: 'dashboard', appDir: __dirname }),
        DashboardLocalePlugin.init({
          displayLanguage: LanguageCode.sv,
          displayLocale: 'SE',
          contentLanguage: LanguageCode.sv,
        }),
      ],
    }),
  )

  const secondAdmin = { emailAddress: 'second-admin@example.com', password: 'second-admin-pw' }

  beforeAll(async () => {
    await server.init({ initialData })
    await adminClient.asSuperAdmin()

    const { roles } = await adminClient.query(GET_SUPERADMIN_ROLE)
    const superAdminRole = roles.items.find((role: { code: string }) => role.code === '__super_admin_role__')
    await adminClient.query(CREATE_ADMINISTRATOR, {
      input: { firstName: 'Second', lastName: 'Admin', ...secondAdmin, roleIds: [superAdminRole.id] },
    })
  }, 120_000)

  afterAll(async () => {
    await server.destroy()
  })

  it('returns the configured defaults to an authenticated administrator', async () => {
    await adminClient.asSuperAdmin()

    const { dashboardLocaleDefaults } = await adminClient.query(GET_DEFAULTS)

    expect(dashboardLocaleDefaults).toEqual({
      displayLanguage: 'sv',
      displayLocale: 'SE',
      contentLanguage: 'sv',
    })
  })

  it('refuses the defaults to an anonymous caller', async () => {
    await adminClient.asAnonymousUser()

    await expect(adminClient.query(GET_DEFAULTS)).rejects.toThrow(/not currently authorized/)
  })

  it('stores the applied-defaults marker per user', async () => {
    await adminClient.asSuperAdmin()
    const { setSettingsStoreValue } = await adminClient.query(SET_SETTING, {
      input: { key: APPLIED_DEFAULTS_KEY, value: 'fingerprint-a' },
    })
    expect(setSettingsStoreValue.result).toBe(true)

    const own = await adminClient.query(GET_SETTING, { key: APPLIED_DEFAULTS_KEY })
    expect(own.getSettingsStoreValue).toBe('fingerprint-a')

    await adminClient.asUserWithCredentials(secondAdmin.emailAddress, secondAdmin.password)
    const other = await adminClient.query(GET_SETTING, { key: APPLIED_DEFAULTS_KEY })
    expect(other.getSettingsStoreValue).toBeNull()
  })
})
