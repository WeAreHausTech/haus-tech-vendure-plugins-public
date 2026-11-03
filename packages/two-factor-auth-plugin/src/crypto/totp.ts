import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export const TOTP_PERIOD_SECONDS = 30
export const TOTP_DIGITS = 6
/** Accepted clock drift, in time steps on either side of the current one. */
export const TOTP_DRIFT_STEPS = 1

/** RFC 4648 base32, without padding, as authenticator apps expect it. */
export function base32Encode(data: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of data) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) {
      throw new Error('Invalid base32 character')
    }
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** A new 160-bit secret, base32 encoded (RFC 4226 recommends at least 128 bits). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/** RFC 4226 HOTP with HMAC-SHA1. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', secret).update(message).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3]
  return (binary % 10 ** digits).toString().padStart(digits, '0')
}

export function timeStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS)
}

/**
 * Returns the time step that `code` belongs to, within the allowed drift, or `undefined`.
 * Steps at or below `lastUsedStep` are refused, so a code cannot be replayed.
 */
export function findMatchingStep(
  secretBase32: string,
  code: string,
  nowMs: number,
  lastUsedStep?: number | null,
): number | undefined {
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(code)) {
    return undefined
  }
  const secret = base32Decode(secretBase32)
  const current = timeStep(nowMs)
  const given = Buffer.from(code)
  let match: number | undefined
  // Compare every candidate so the time taken does not depend on which one matches.
  for (let step = current - TOTP_DRIFT_STEPS; step <= current + TOTP_DRIFT_STEPS; step++) {
    const expected = Buffer.from(hotp(secret, step))
    if (timingSafeEqual(expected, given) && (lastUsedStep == null || step > lastUsedStep)) {
      match = step
    }
  }
  return match
}

export function buildOtpauthUri(input: {
  issuer: string
  account: string
  secret: string
}): string {
  const label = encodeURIComponent(`${input.issuer}:${input.account}`)
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}
