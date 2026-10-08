import { describe, expect, it } from 'vitest'

import {
  defaultsFingerprint,
  LocaleDefaults,
  LocaleSettings,
  matchesDefaults,
  resolveLocaleAction,
} from './resolve-locale-action'

const swedish: LocaleDefaults = { displayLanguage: 'sv', displayLocale: 'SE', contentLanguage: 'sv' }
const english: LocaleSettings = { displayLanguage: 'en', displayLocale: undefined, contentLanguage: 'en' }

describe('resolveLocaleAction', () => {
  it('applies every configured default when the user has never had them applied', () => {
    const action = resolveLocaleAction(english, swedish, null)

    expect(action).toEqual({
      type: 'apply',
      patch: { displayLanguage: 'sv', displayLocale: 'SE', contentLanguage: 'sv' },
    })
  })

  it('only patches the fields that differ from the defaults', () => {
    const action = resolveLocaleAction({ ...english, displayLanguage: 'sv' }, swedish, null)

    expect(action).toEqual({ type: 'apply', patch: { displayLocale: 'SE', contentLanguage: 'sv' } })
  })

  it('writes the marker once the settings match the defaults', () => {
    const settings: LocaleSettings = { displayLanguage: 'sv', displayLocale: 'SE', contentLanguage: 'sv' }

    const action = resolveLocaleAction(settings, swedish, null)

    expect(action).toEqual({ type: 'mark', marker: defaultsFingerprint(swedish) })
  })

  it('leaves a later choice alone once the marker matches the defaults', () => {
    const action = resolveLocaleAction(english, swedish, defaultsFingerprint(swedish))

    expect(action).toEqual({ type: 'none' })
  })

  it('applies again when the configured defaults changed since the marker was written', () => {
    const previous: LocaleDefaults = { displayLanguage: 'de', displayLocale: 'DE', contentLanguage: 'de' }

    const action = resolveLocaleAction(english, swedish, defaultsFingerprint(previous))

    expect(action.type).toBe('apply')
  })

  it('does not touch fields that have no configured default', () => {
    const action = resolveLocaleAction(english, { displayLanguage: 'sv' }, null)

    expect(action).toEqual({ type: 'apply', patch: { displayLanguage: 'sv' } })
  })

  it('treats null defaults from the API as not configured', () => {
    const action = resolveLocaleAction(
      english,
      { displayLanguage: 'sv', displayLocale: null, contentLanguage: null },
      null,
    )

    expect(action).toEqual({ type: 'apply', patch: { displayLanguage: 'sv' } })
  })

  it('skips a content language the active channel does not offer', () => {
    const action = resolveLocaleAction(english, swedish, null, ['en', 'de'])

    expect(action).toEqual({ type: 'apply', patch: { displayLanguage: 'sv', displayLocale: 'SE' } })
  })

  it('marks once the rest matches when the content language is not offered', () => {
    const settings: LocaleSettings = { displayLanguage: 'sv', displayLocale: 'SE', contentLanguage: 'en' }

    const action = resolveLocaleAction(settings, swedish, null, ['en'])

    expect(action).toEqual({ type: 'mark', marker: defaultsFingerprint(swedish) })
  })

  it('applies the content language when the active channel offers it', () => {
    const settings: LocaleSettings = { displayLanguage: 'sv', displayLocale: 'SE', contentLanguage: 'en' }

    const action = resolveLocaleAction(settings, swedish, null, ['en', 'sv'])

    expect(action).toEqual({ type: 'apply', patch: { contentLanguage: 'sv' } })
  })

  it('ignores a marker that is not a string', () => {
    const action = resolveLocaleAction(english, swedish, { unexpected: true })

    expect(action.type).toBe('apply')
  })
})

describe('defaultsFingerprint', () => {
  it('is the same for undefined and null optional fields', () => {
    expect(defaultsFingerprint({ displayLanguage: 'sv' })).toBe(
      defaultsFingerprint({ displayLanguage: 'sv', displayLocale: null, contentLanguage: null }),
    )
  })

  it('differs when any configured value differs', () => {
    expect(defaultsFingerprint(swedish)).not.toBe(defaultsFingerprint({ ...swedish, displayLocale: 'FI' }))
  })
})

describe('matchesDefaults', () => {
  it('is true when the stored settings hold every configured default', () => {
    expect(matchesDefaults({ displayLanguage: 'sv', displayLocale: 'SE', contentLanguage: 'sv', theme: 'dark' }, swedish)).toBe(true)
  })

  it('is false when a stored setting differs from its default', () => {
    expect(matchesDefaults({ displayLanguage: 'en', displayLocale: 'SE', contentLanguage: 'sv' }, swedish)).toBe(false)
  })

  it('is false when a default is missing from the stored settings', () => {
    expect(matchesDefaults({ displayLanguage: 'sv', contentLanguage: 'sv' }, swedish)).toBe(false)
  })

  it('is false when nothing is stored yet', () => {
    expect(matchesDefaults(null, swedish)).toBe(false)
    expect(matchesDefaults('not settings', swedish)).toBe(false)
  })

  it('ignores a content language the active channel does not offer', () => {
    expect(matchesDefaults({ displayLanguage: 'sv', displayLocale: 'SE', contentLanguage: 'en' }, swedish, ['en'])).toBe(true)
  })
})
