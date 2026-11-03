export { TwoFactorAuthPlugin } from './two-factor-auth.plugin'
export { TwoFactorEvent, type TwoFactorEventType } from './two-factor.event'
export { TwoFactorService } from './service/two-factor.service'
export { TwoFactorCredential } from './entity/two-factor-credential.entity'
export { TwoFactorChallenge } from './entity/two-factor-challenge.entity'
export { TwoFactorNativeAuthenticationStrategy } from './strategy/two-factor-native-authentication-strategy'
export {
  TwoFactorCodeAuthenticationStrategy,
  type TwoFactorAuthenticationData,
} from './strategy/two-factor-code-authentication-strategy'
export { TWO_FACTOR_STRATEGY_NAME, TwoFactorAuthError, resetTwoFactorPermission } from './constants'
export type { TwoFactorAuthPluginOptions } from './types'
