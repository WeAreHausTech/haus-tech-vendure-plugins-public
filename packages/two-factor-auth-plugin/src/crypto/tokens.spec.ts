import { describe, expect, it } from 'vitest'

import { generateBackupCodes, generateToken, hashBackupCode, normalizeBackupCode } from './tokens'

describe('generateBackupCodes', () => {
  it('returns the requested number of distinct, formatted codes', () => {
    const codes = generateBackupCodes(10)
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-hjkmnp-tv-z]{4}(-[0-9a-hjkmnp-tv-z]{4}){3}$/)
    }
  })
})

describe('hashBackupCode', () => {
  it('ignores case, separators and look-alike characters', () => {
    const [code] = generateBackupCodes(1)
    expect(hashBackupCode(code.toUpperCase().replace(/-/g, ' '))).toBe(hashBackupCode(code))
    expect(normalizeBackupCode('AbIl-oO12')).toBe('ab1100' + '12')
  })
})

describe('generateToken', () => {
  it('returns 256-bit url-safe tokens', () => {
    const token = generateToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(generateToken()).not.toBe(token)
  })
})
