import { randomBytes } from 'crypto'
import { describe, expect, it } from 'vitest'

import { SecretCipher } from './secret-cipher'

const newKey = () => randomBytes(32).toString('base64')

describe('SecretCipher', () => {
  it('round-trips a secret', () => {
    const cipher = new SecretCipher([newKey()])
    const payload = cipher.encrypt('JBSWY3DPEHPK3PXP', 'user:1')
    expect(payload).not.toContain('JBSWY3DPEHPK3PXP')
    expect(cipher.decrypt(payload, 'user:1')).toBe('JBSWY3DPEHPK3PXP')
  })

  it('uses a fresh IV for every encryption', () => {
    const cipher = new SecretCipher([newKey()])
    expect(cipher.encrypt('same', 'a')).not.toBe(cipher.encrypt('same', 'a'))
  })

  it('refuses a payload moved to another owner', () => {
    const cipher = new SecretCipher([newKey()])
    const payload = cipher.encrypt('secret', 'user:1')
    expect(() => cipher.decrypt(payload, 'user:2')).toThrow()
  })

  it('refuses a tampered payload', () => {
    const cipher = new SecretCipher([newKey()])
    const parts = cipher.encrypt('secret', 'user:1').split('.')
    const ciphertext = Buffer.from(parts[4], 'base64url')
    ciphertext[0] ^= 1
    parts[4] = ciphertext.toString('base64url')
    expect(() => cipher.decrypt(parts.join('.'), 'user:1')).toThrow()
  })

  it('decrypts with an older key and reports that re-encryption is due', () => {
    const oldKey = newKey()
    const before = new SecretCipher([oldKey])
    const payload = before.encrypt('secret', 'user:1')
    const after = new SecretCipher([newKey(), oldKey])

    expect(after.decrypt(payload, 'user:1')).toBe('secret')
    expect(after.needsReencryption(payload)).toBe(true)
    expect(after.needsReencryption(after.encrypt('secret', 'user:1'))).toBe(false)
  })

  it('fails clearly when the key is no longer configured', () => {
    const payload = new SecretCipher([newKey()]).encrypt('secret', 'user:1')
    expect(() => new SecretCipher([newKey()]).decrypt(payload, 'user:1')).toThrow(
      /no configured encryption key/,
    )
  })

  it('refuses missing or wrongly sized keys', () => {
    expect(() => new SecretCipher([])).toThrow(/at least one/)
    expect(() => new SecretCipher(['too-short'])).toThrow(/32 bytes/)
    expect(() => new SecretCipher([randomBytes(16).toString('base64')])).toThrow(/32 bytes/)
  })
})
