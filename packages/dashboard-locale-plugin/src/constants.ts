export const DASHBOARD_LOCALE_PLUGIN_OPTIONS = Symbol('DASHBOARD_LOCALE_PLUGIN_OPTIONS')

export const SETTINGS_STORE_NAMESPACE = 'haus.dashboardLocale'
export const APPLIED_DEFAULTS_FIELD = 'appliedDefaults'
/** Settings store key of the per-user marker recording which defaults were already applied. */
export const APPLIED_DEFAULTS_KEY = `${SETTINGS_STORE_NAMESPACE}.${APPLIED_DEFAULTS_FIELD}`
