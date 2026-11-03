import { createHash, randomBytes } from 'crypto'

// Crockford base32: no I, L, O or U, so codes are easy to read aloud and type.
const BACKUP_CODE_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'
const BACKUP_CODE_BYTES = 10 // 80 bits, 16 characters

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** A random, URL-safe token with 256 bits of entropy. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

function encodeBackupCode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BACKUP_CODE_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return output
}

/** Codes formatted as `xxxx-xxxx-xxxx-xxxx`. */
export function generateBackupCodes(count: number): string[] {
  return Array.from({ length: count }, () =>
    encodeBackupCode(randomBytes(BACKUP_CODE_BYTES)).match(/.{4}/g)!.join('-'),
  )
}

/** Lowercases, drops separators and maps look-alike characters, as Crockford base32 does. */
export function normalizeBackupCode(code: string): string {
  return code.toLowerCase().replace(/[\s-]/g, '').replace(/[il]/g, '1').replace(/o/g, '0')
}

export function hashBackupCode(code: string): string {
  return sha256Hex(normalizeBackupCode(code))
}
