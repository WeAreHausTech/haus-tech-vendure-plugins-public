import {
  api,
  getSettingsStoreValueDocument,
  setSettingsStoreValueDocument,
  useAuth,
  useChannel,
  useUserSettings,
} from '@vendure/dashboard'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { APPLIED_DEFAULTS_KEY } from './constants'
import { dashboardLocaleDefaultsDocument, DashboardLocaleDefaultsResult } from './gql'
import { resolveLocaleAction } from './resolve-locale-action'

/**
 * Same key and query as the Dashboard's own UserSettingsProvider, so this component shares
 * its cache entry and only acts once the server copy of the user settings has arrived.
 */
const USER_SETTINGS_KEY = 'vendure.dashboard.userSettings'
const userSettingsQueryKey = ['user-settings', USER_SETTINGS_KEY]

/** Scoped by administrator, so a cached marker never carries over to another login in the same tab. */
const markerQueryKey = (administratorId: string | undefined) => [
  'dashboard-locale',
  'applied-defaults',
  administratorId,
]

/**
 * Renders nothing. Applies the configured locale defaults once per administrator and then
 * records a marker in the settings store, so a later choice in the language dialog stands.
 */
export function LocaleDefaultsApplier() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { activeChannel } = useChannel()
  const { settings, setDisplayLanguage, setDisplayLocale, setContentLanguage, settingsStoreIsAvailable } =
    useUserSettings()
  const administratorId = user?.id

  const serverSettings = useQuery({
    queryKey: userSettingsQueryKey,
    queryFn: () => api.query(getSettingsStoreValueDocument, { key: USER_SETTINGS_KEY }),
    retry: false,
    staleTime: 0,
    enabled: settingsStoreIsAvailable,
  })
  const defaults = useQuery({
    queryKey: ['dashboard-locale', 'defaults'],
    queryFn: () => api.query<DashboardLocaleDefaultsResult>(dashboardLocaleDefaultsDocument),
    staleTime: Infinity,
  })
  const marker = useQuery({
    queryKey: markerQueryKey(administratorId),
    queryFn: () => api.query(getSettingsStoreValueDocument, { key: APPLIED_DEFAULTS_KEY }),
    retry: false,
    staleTime: Infinity,
    enabled: administratorId != null,
  })
  const writeMarker = useMutation({
    mutationFn: async (value: string) => {
      const { setSettingsStoreValue } = await api.mutate(setSettingsStoreValueDocument, {
        input: { key: APPLIED_DEFAULTS_KEY, value },
      })
      // The settings store reports a refused write in the result, not as a GraphQL error.
      if (!setSettingsStoreValue.result) {
        throw new Error(setSettingsStoreValue.error ?? 'The settings store refused the write')
      }
    },
    onSuccess: (_, value) => {
      queryClient.setQueryData(markerQueryKey(administratorId), { getSettingsStoreValue: value })
    },
    onError: error => {
      console.error('Failed to store the dashboard locale marker:', error)
    },
  })

  // Waiting for refetches to settle keeps a previous login's cached settings out of the decision.
  const isReady =
    serverSettings.isSuccess &&
    !serverSettings.isFetching &&
    defaults.isSuccess &&
    marker.isSuccess &&
    !marker.isFetching &&
    activeChannel != null

  useEffect(() => {
    if (!isReady || !defaults.data || writeMarker.isPending) {
      return
    }
    const action = resolveLocaleAction(
      settings,
      defaults.data.dashboardLocaleDefaults,
      marker.data?.getSettingsStoreValue,
      activeChannel?.availableLanguageCodes ?? undefined,
    )
    if (action.type === 'apply') {
      const { displayLanguage, displayLocale, contentLanguage } = action.patch
      if (displayLanguage) setDisplayLanguage(displayLanguage)
      if (displayLocale) setDisplayLocale(displayLocale)
      if (contentLanguage) setContentLanguage(contentLanguage)
    } else if (action.type === 'mark') {
      // Do not retry a marker write that just failed; a reload or new defaults try again.
      const failedSameWrite = writeMarker.isError && writeMarker.variables === action.marker
      if (!failedSameWrite) {
        writeMarker.mutate(action.marker)
      }
    }
    // The setters from useUserSettings are recreated on every render, so they are left out
    // to keep this effect from running on each render.
  }, [
    isReady,
    settings,
    defaults.data,
    marker.data,
    activeChannel,
    writeMarker.isPending,
    writeMarker.isError,
    writeMarker.variables,
  ])

  return null
}
