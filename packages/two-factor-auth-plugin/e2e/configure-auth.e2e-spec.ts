import { NativeAuthenticationStrategy, RuntimeVendureConfig } from '@vendure/core'
import { describe, expect, it } from 'vitest'

import { TwoFactorCodeAuthenticationStrategy } from '../src/strategy/two-factor-code-authentication-strategy'
import { TwoFactorNativeAuthenticationStrategy } from '../src/strategy/two-factor-native-authentication-strategy'
import { configureAuth, TwoFactorAuthPlugin } from '../src/two-factor-auth.plugin'

describe('TwoFactorAuthPlugin configuration', () => {
  it('can run more than once on the same config, as runMigrations then bootstrap does', () => {
    TwoFactorAuthPlugin.init({ encryptionKeys: [Buffer.alloc(32, 1).toString('base64')] })
    const native = new NativeAuthenticationStrategy()
    const config = {
      authOptions: { adminAuthenticationStrategy: [native], customPermissions: [] },
    } as unknown as RuntimeVendureConfig

    configureAuth(config)
    configureAuth(config)

    const strategies = config.authOptions.adminAuthenticationStrategy
    expect(strategies).toHaveLength(2)
    expect(strategies[0]).toBeInstanceOf(TwoFactorNativeAuthenticationStrategy)
    expect(strategies[1]).toBeInstanceOf(TwoFactorCodeAuthenticationStrategy)
    expect(config.authOptions.customPermissions.map((p) => p.Permission)).toEqual([
      'ResetTwoFactor',
    ])
  })
})
