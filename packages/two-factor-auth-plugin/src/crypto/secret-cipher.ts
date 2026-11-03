import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const FORMAT_VERSION = 'v1'
const IV_BYTES = 12

interface EncryptionKey {
  id: string
  key: Buffer
}

/**
 * Encrypts TOTP secrets at rest with AES-256-GCM.
 *
 * Keys are base64-encoded 32-byte values. The first key encrypts; every key decrypts, so a
 * new key can be put first and the old one kept until all secrets have been re-encrypted.
 * Each ciphertext names the key it was made with by a short id derived from the key.
 */
export class SecretCipher {
  private readonly keys: EncryptionKey[]

  constructor(encodedKeys: string[]) {
    if (!encodedKeys?.length) {
      throw new Error('TwoFactorAuthPlugin: at least one encryption key is required')
    }
    this.keys = encodedKeys.map((encoded, index) => {
      const key = Buffer.from(encoded ?? '', 'base64')
      if (key.length !== 32) {
        throw new Error(
          `TwoFactorAuthPlugin: encryption key ${index + 1} must be 32 bytes, base64 encoded ` +
            '(generate one with `openssl rand -base64 32`)',
        )
      }
      return { id: createHash('sha256').update(key).digest('hex').slice(0, 8), key }
    })
  }

  /** `associatedData` binds the ciphertext to its owner, so it cannot be moved to another row. */
  encrypt(plaintext: string, associatedData: string): string {
    const { id, key } = this.keys[0]
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    cipher.setAAD(Buffer.from(associatedData))
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return [FORMAT_VERSION, id, iv, tag, ciphertext]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.')
  }

  decrypt(payload: string, associatedData: string): string {
    const [version, keyId, iv, tag, ciphertext] = payload.split('.')
    if (version !== FORMAT_VERSION || !ciphertext) {
      throw new Error('TwoFactorAuthPlugin: unrecognised secret format')
    }
    const entry = this.keys.find((k) => k.id === keyId)
    if (!entry) {
      throw new Error(`TwoFactorAuthPlugin: no configured encryption key matches key id ${keyId}`)
    }
    const decipher = createDecipheriv(ALGORITHM, entry.key, Buffer.from(iv, 'base64url'))
    decipher.setAAD(Buffer.from(associatedData))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  }

  /** True when the payload was encrypted with a key other than the current first key. */
  needsReencryption(payload: string): boolean {
    return payload.split('.')[1] !== this.keys[0].id
  }
}
