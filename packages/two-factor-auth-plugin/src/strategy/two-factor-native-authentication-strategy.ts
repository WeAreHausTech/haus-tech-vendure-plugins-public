import {
  AuthenticationStrategy,
  ID,
  Injector,
  NATIVE_AUTH_STRATEGY_NAME,
  NativeAuthenticationData,
  NativeAuthenticationStrategy,
  RequestContext,
  User,
} from '@vendure/core'
import { DocumentNode } from 'graphql'

import { TwoFactorAuthError } from '../constants'
import { TwoFactorService } from '../service/two-factor.service'

/**
 * @description
 * Takes the place of the Admin API `native` strategy and keeps its name, so `login` and the
 * other native-only operations keep working. A correct password from an administrator who
 * must use a second factor is refused with `TWO_FACTOR_REQUIRED`, so no session is created
 * from the password alone. The second factor is then given through `twoFactor`.
 *
 * The plugin wraps the configured native strategy, so a customised one keeps its behaviour.
 *
 * @category Auth
 */
export class TwoFactorNativeAuthenticationStrategy
  implements AuthenticationStrategy<NativeAuthenticationData>
{
  readonly name = NATIVE_AUTH_STRATEGY_NAME
  private twoFactorService: TwoFactorService

  constructor(
    private readonly inner: NativeAuthenticationStrategy = new NativeAuthenticationStrategy(),
  ) {}

  async init(injector: Injector) {
    await this.inner.init(injector)
    this.twoFactorService = injector.get(TwoFactorService)
  }

  defineInputType(): DocumentNode {
    return this.inner.defineInputType()
  }

  async authenticate(
    ctx: RequestContext,
    data: NativeAuthenticationData,
  ): Promise<User | false | string> {
    const user = await this.inner.authenticate(ctx, data)
    if (!user) {
      return false
    }
    const requirement = await this.twoFactorService.getLoginRequirement(ctx, user)
    return requirement === 'none' ? user : TwoFactorAuthError.REQUIRED
  }

  /** Checks the password alone. Used by the two-factor sign-in, which never creates a session here. */
  verifyPassword(ctx: RequestContext, data: NativeAuthenticationData): Promise<User | false> {
    return this.inner.authenticate(ctx, data)
  }

  verifyUserPassword(ctx: RequestContext, userId: ID, password: string): Promise<boolean> {
    return this.inner.verifyUserPassword(ctx, userId, password)
  }
}
