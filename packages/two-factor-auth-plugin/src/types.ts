import type { RequestContext, User } from '@vendure/core'

/**
 * @description
 * Options passed to {@link TwoFactorAuthPlugin}.init.
 *
 * @category Options
 */
export interface TwoFactorAuthPluginOptions {
  /**
   * Base64-encoded 32-byte keys that encrypt the TOTP secrets at rest. Generate one with
   * `openssl rand -base64 32` and keep it out of source control.
   *
   * The first key encrypts. Keep older keys after it to rotate: secrets made with an older
   * key are re-encrypted with the first key the next time their owner signs in.
   */
  encryptionKeys: string[]
  /**
   * The issuer name shown in authenticator apps. Defaults to `Vendure`.
   */
  issuer?: string
  /**
   * Whether an administrator must use two-factor authentication. An administrator who must but
   * has not enrolled is asked to enrol during sign-in, before any session is created.
   *
   * Pass a function to decide per user, for example by role. The user has its roles loaded.
   * Defaults to `false`: enrolment is optional.
   */
  required?: boolean | ((ctx: RequestContext, user: User) => boolean | Promise<boolean>)
  /**
   * How long a sign-in challenge stays valid after the password step, in seconds. Defaults to 300.
   */
  challengeTtlSeconds?: number
  /**
   * Wrong codes in a row before the account's second factor is locked. Defaults to 5.
   */
  maxFailedAttempts?: number
  /**
   * How long the second factor stays locked after too many wrong codes, in seconds. Defaults to 900.
   */
  lockoutSeconds?: number
  /**
   * How many single-use backup codes to issue. Defaults to 10.
   */
  backupCodeCount?: number
}

export type ResolvedTwoFactorAuthPluginOptions = Required<TwoFactorAuthPluginOptions>

export type TwoFactorErrorCode =
  | 'INVALID_CODE'
  | 'INVALID_PASSWORD'
  | 'CHALLENGE_EXPIRED'
  | 'LOCKED'
  | 'ALREADY_ENABLED'
  | 'NOT_ENABLED'
  | 'NO_PENDING_ENROLMENT'
  | 'REQUIRED'

export type TwoFactorLoginStatus =
  | 'NOT_REQUIRED'
  | 'CODE_REQUIRED'
  | 'ENROLMENT_REQUIRED'
  | 'INVALID_CREDENTIALS'

export interface TwoFactorEnrolmentSecret {
  secret: string
  otpauthUri: string
  qrCodeDataUrl: string
}

export interface TwoFactorLoginResult {
  status: TwoFactorLoginStatus
  challengeToken?: string
  expiresAt?: Date
  enrolment?: TwoFactorEnrolmentSecret
}

export interface TwoFactorResult {
  success: boolean
  error?: TwoFactorErrorCode
}

export interface TwoFactorBackupCodesResult extends TwoFactorResult {
  backupCodes?: string[]
}

export interface TwoFactorEnrolmentStartResult extends TwoFactorResult {
  enrolment?: TwoFactorEnrolmentSecret
}

export interface TwoFactorStatus {
  enabled: boolean
  enabledAt: Date | null
  required: boolean
  backupCodesRemaining: number
}
