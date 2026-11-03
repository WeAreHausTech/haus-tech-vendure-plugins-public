import { PermissionDefinition } from '@vendure/core'

export const PLUGIN_INIT_OPTIONS = Symbol('TWO_FACTOR_AUTH_PLUGIN_OPTIONS')
export const loggerCtx = 'TwoFactorAuthPlugin'

/** Name of the authentication strategy that takes the second factor. */
export const TWO_FACTOR_STRATEGY_NAME = 'twoFactor'

/**
 * `authenticationError` values returned in `InvalidCredentialsError`. Clients can match on them.
 */
export const TwoFactorAuthError = {
  /** The password was right, but this administrator must sign in with a second factor. */
  REQUIRED: 'TWO_FACTOR_REQUIRED',
  INVALID_CODE: 'TWO_FACTOR_INVALID_CODE',
  CHALLENGE_EXPIRED: 'TWO_FACTOR_CHALLENGE_EXPIRED',
  ENROLMENT_INCOMPLETE: 'TWO_FACTOR_ENROLMENT_INCOMPLETE',
  LOCKED: 'TWO_FACTOR_LOCKED',
} as const

export const resetTwoFactorPermission = new PermissionDefinition({
  name: 'ResetTwoFactor',
  description: "Allows resetting another administrator's two-factor authentication",
  assignable: true,
})
