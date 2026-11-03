import { describe, expect, it } from 'vitest'

import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  findMatchingStep,
  generateTotpSecret,
  hotp,
  timeStep,
} from './totp'

// RFC 4226 appendix D and RFC 6238 appendix B use this ASCII secret.
const RFC_SECRET = Buffer.from('12345678901234567890')
const RFC_SECRET_BASE32 = base32Encode(RFC_SECRET)

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const data = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7])
    expect(base32Decode(base32Encode(data))).toEqual(data)
  })

  it('matches the RFC 4648 test vector', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI')
  })

  it('rejects characters outside the alphabet', () => {
    expect(() => base32Decode('ABC1')).toThrow()
  })
})

describe('hotp', () => {
  it.each([
    [0, '755224'],
    [1, '287082'],
    [2, '359152'],
    [9, '520489'],
  ])('matches RFC 4226 for counter %i', (counter, expected) => {
    expect(hotp(RFC_SECRET, counter)).toBe(expected)
  })

  it('matches RFC 6238 SHA1 vectors with 8 digits', () => {
    expect(hotp(RFC_SECRET, timeStep(59_000), 8)).toBe('94287082')
    expect(hotp(RFC_SECRET, timeStep(1_111_111_109_000), 8)).toBe('07081804')
  })
})

describe('findMatchingStep', () => {
  const now = 1_111_111_109_000
  const step = timeStep(now)
  const codeAt = (s: number) => hotp(RFC_SECRET, s)

  it('accepts the current step', () => {
    expect(findMatchingStep(RFC_SECRET_BASE32, codeAt(step), now)).toBe(step)
  })

  it('accepts one step of drift either way', () => {
    expect(findMatchingStep(RFC_SECRET_BASE32, codeAt(step - 1), now)).toBe(step - 1)
    expect(findMatchingStep(RFC_SECRET_BASE32, codeAt(step + 1), now)).toBe(step + 1)
  })

  it('refuses codes two steps away', () => {
    expect(findMatchingStep(RFC_SECRET_BASE32, codeAt(step - 2), now)).toBeUndefined()
    expect(findMatchingStep(RFC_SECRET_BASE32, codeAt(step + 2), now)).toBeUndefined()
  })

  it('refuses a step that was already used', () => {
    expect(findMatchingStep(RFC_SECRET_BASE32, codeAt(step), now, step)).toBeUndefined()
    expect(findMatchingStep(RFC_SECRET_BASE32, codeAt(step - 1), now, step - 1)).toBeUndefined()
    expect(findMatchingStep(RFC_SECRET_BASE32, codeAt(step), now, step - 1)).toBe(step)
  })

  it('refuses malformed codes', () => {
    expect(findMatchingStep(RFC_SECRET_BASE32, '12345', now)).toBeUndefined()
    expect(findMatchingStep(RFC_SECRET_BASE32, 'abcdef', now)).toBeUndefined()
    expect(findMatchingStep(RFC_SECRET_BASE32, '', now)).toBeUndefined()
  })
})

describe('generateTotpSecret', () => {
  it('returns 160 bits, base32 encoded', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Decode(secret)).toHaveLength(20)
    expect(generateTotpSecret()).not.toBe(secret)
  })
})

describe('buildOtpauthUri', () => {
  it('encodes issuer and account in the label and parameters', () => {
    const uri = buildOtpauthUri({ issuer: 'My Shop', account: 'admin@example.com', secret: 'ABC' })
    expect(uri).toBe(
      'otpauth://totp/My%20Shop%3Aadmin%40example.com?secret=ABC&issuer=My+Shop&algorithm=SHA1&digits=6&period=30',
    )
  })
})
