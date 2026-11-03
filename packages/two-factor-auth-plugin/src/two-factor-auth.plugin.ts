import { OnApplicationBootstrap } from '@nestjs/common'
import {
  ConfigService,
  Logger,
  NATIVE_AUTH_STRATEGY_NAME,
  NativeAuthenticationStrategy,
  PluginCommonModule,
  RuntimeVendureConfig,
  VendurePlugin,
} from '@vendure/core'

import { adminApiExtensions } from './api/api-extensions'
import {
  AdministratorTwoFactorEntityResolver,
  TwoFactorAdminResolver,
  TwoFactorLoginResolver,
} from './api/two-factor.resolver'
import { loggerCtx, PLUGIN_INIT_OPTIONS, resetTwoFactorPermission } from './constants'
import { SecretCipher } from './crypto/secret-cipher'
import { TwoFactorChallenge } from './entity/two-factor-challenge.entity'
import { TwoFactorCredential } from './entity/two-factor-credential.entity'
import { TwoFactorService } from './service/two-factor.service'
import { TwoFactorCodeAuthenticationStrategy } from './strategy/two-factor-code-authentication-strategy'
import { TwoFactorNativeAuthenticationStrategy } from './strategy/two-factor-native-authentication-strategy'
import { ResolvedTwoFactorAuthPluginOptions, TwoFactorAuthPluginOptions } from './types'

const defaultOptions: Omit<ResolvedTwoFactorAuthPluginOptions, 'encryptionKeys'> = {
  issuer: 'Vendure',
  required: false,
  challengeTtlSeconds: 300,
  maxFailedAttempts: 5,
  lockoutSeconds: 900,
  backupCodeCount: 10,
}

function configureAuth(config: RuntimeVendureConfig): RuntimeVendureConfig {
  if (!TwoFactorAuthPlugin.options) {
    throw new Error(
      'TwoFactorAuthPlugin: call TwoFactorAuthPlugin.init({ encryptionKeys }) in the plugins list',
    )
  }
  const strategies = config.authOptions.adminAuthenticationStrategy
  const index = strategies.findIndex((s) => s.name === NATIVE_AUTH_STRATEGY_NAME)
  const native = strategies[index]
  if (!(native instanceof NativeAuthenticationStrategy)) {
    throw new Error(
      'TwoFactorAuthPlugin needs the NativeAuthenticationStrategy (or a subclass) in authOptions.adminAuthenticationStrategy',
    )
  }
  strategies[index] = new TwoFactorNativeAuthenticationStrategy(native)
  strategies.push(new TwoFactorCodeAuthenticationStrategy())
  config.authOptions.customPermissions.push(resetTwoFactorPermission)
  return config
}

/**
 * @description
 * Adds two-factor authentication (TOTP authenticator apps plus single-use backup codes) to
 * administrator sign-in on the Admin API and in the React Dashboard.
 *
 * No session is ever created from a password alone for an administrator who has enrolled.
 * The first step, `twoFactorLogin`, checks the password and returns a challenge. The second
 * step redeems the challenge with a code through the core `authenticate` mutation.
 *
 * Shop API customer sign-in is not affected.
 *
 * @example
 * ```ts
 * import { TwoFactorAuthPlugin } from '@haus-tech/two-factor-auth-plugin'
 *
 * export const config = {
 *   plugins: [
 *     TwoFactorAuthPlugin.init({
 *       encryptionKeys: [process.env.TWO_FACTOR_ENCRYPTION_KEY!],
 *       issuer: 'My Shop',
 *     }),
 *   ],
 * }
 * ```
 *
 * @category Plugin
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [
    {
      provide: PLUGIN_INIT_OPTIONS,
      useFactory: () => TwoFactorAuthPlugin.options,
    },
    TwoFactorService,
  ],
  adminApiExtensions: {
    schema: adminApiExtensions,
    resolvers: [
      TwoFactorLoginResolver,
      TwoFactorAdminResolver,
      AdministratorTwoFactorEntityResolver,
    ],
  },
  entities: [TwoFactorCredential, TwoFactorChallenge],
  configuration: configureAuth,
  dashboard: './dashboard/index.tsx',
  compatibility: '^3.8.0',
})
export class TwoFactorAuthPlugin implements OnApplicationBootstrap {
  static options: ResolvedTwoFactorAuthPluginOptions

  static init(options: TwoFactorAuthPluginOptions) {
    // Fails at startup on a missing or malformed key, not at the first sign-in.
    new SecretCipher(options.encryptionKeys)
    this.options = { ...defaultOptions, ...options }
    return TwoFactorAuthPlugin
  }

  constructor(private configService: ConfigService) {}

  onApplicationBootstrap() {
    if (this.configService.authOptions.disableAuth) {
      Logger.warn(
        'authOptions.disableAuth is true: two-factor authentication is not enforced',
        loggerCtx,
      )
    }
  }
}
