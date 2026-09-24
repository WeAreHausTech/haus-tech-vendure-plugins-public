/**
 * The configured defaults as returned by the `dashboardLocaleDefaults` Admin API query.
 * Optional fields come back as `null` when they are not configured.
 */
export interface LocaleDefaults {
  displayLanguage: string
  displayLocale?: string | null
  contentLanguage?: string | null
}

/** The subset of the Dashboard user settings that this plugin manages. */
export interface LocaleSettings {
  displayLanguage: string
  displayLocale?: string
  contentLanguage: string
}

export type LocaleAction =
  | { type: 'none' }
  | { type: 'apply'; patch: Partial<LocaleSettings> }
  | { type: 'mark'; marker: string }

const MANAGED_FIELDS = ['displayLanguage', 'displayLocale', 'contentLanguage'] as const

/**
 * A stable string identifying a set of defaults. Stored as the per-user marker, so that
 * changing the configured defaults applies them once more to every user.
 */
export function defaultsFingerprint(defaults: LocaleDefaults): string {
  return JSON.stringify(MANAGED_FIELDS.map(field => defaults[field] ?? null))
}

/**
 * Decides what to do with a user's settings. The caller runs this on every settings change
 * and acts on the result, so the outcome converges even when the server copy of the settings
 * overwrites a patch that was applied a moment earlier:
 *
 * - `none`: the defaults were already applied once; any later choice by the user stands.
 * - `apply`: patch the settings with the defaults that differ.
 * - `mark`: the settings match the defaults; persist the marker so this never runs again.
 *
 * `availableContentLanguages` are the active channel's languages. A content language the
 * channel does not offer is skipped, since the Dashboard would reset it straight away.
 */
export function resolveLocaleAction(
  settings: LocaleSettings,
  defaults: LocaleDefaults,
  marker: unknown,
  availableContentLanguages?: readonly string[],
): LocaleAction {
  const fingerprint = defaultsFingerprint(defaults)
  if (marker === fingerprint) {
    return { type: 'none' }
  }
  const patch: Partial<LocaleSettings> = {}
  for (const field of MANAGED_FIELDS) {
    const value = defaults[field]
    const isOffered =
      field !== 'contentLanguage' || !availableContentLanguages || availableContentLanguages.includes(value ?? '')
    if (value != null && isOffered && settings[field] !== value) {
      patch[field] = value
    }
  }
  if (Object.keys(patch).length === 0) {
    return { type: 'mark', marker: fingerprint }
  }
  return { type: 'apply', patch }
}
