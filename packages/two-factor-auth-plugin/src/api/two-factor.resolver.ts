import { Args, Context, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql'
import {
  Administrator,
  AdministratorService,
  Allow,
  AuthService,
  ConfigService,
  Ctx,
  ForbiddenError,
  ID,
  InvalidCredentialsError,
  isGraphQlErrorResult,
  NATIVE_AUTH_STRATEGY_NAME,
  Permission,
  RequestContext,
  setSessionToken,
  Transaction,
  User,
  UserService,
} from '@vendure/core'
import { getUserChannelsPermissions } from '@vendure/core/dist/service/helpers/utils/get-user-channels-permissions'

import { resetTwoFactorPermission, TwoFactorAuthError } from '../constants'
import { TwoFactorService } from '../service/two-factor.service'

// Taken from core so they match the express types core was built against.
type SessionTokenArgs = Parameters<typeof setSessionToken>[0]

@Resolver()
export class TwoFactorLoginResolver {
  constructor(
    private twoFactorService: TwoFactorService,
    private administratorService: AdministratorService,
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Transaction()
  @Mutation()
  @Allow(Permission.Public)
  twoFactorLogin(@Ctx() ctx: RequestContext, @Args() args: { username: string; password: string }) {
    return this.twoFactorService.beginLogin(ctx, args.username, args.password)
  }

  @Transaction()
  @Mutation()
  @Allow(Permission.Public)
  completeTwoFactorLoginEnrolment(
    @Ctx() ctx: RequestContext,
    @Args() args: { challengeToken: string; code: string },
  ) {
    return this.twoFactorService.completeLoginEnrolment(ctx, args.challengeToken, args.code)
  }

  /**
   * Replaces the core resolver. Core signs the administrator in with the new password alone
   * and throws when that fails, which rolls the reset back. Here the password is reset, and
   * a session is only created when no second factor applies. Otherwise the administrator is
   * returned without a session and signs in with the second factor as usual.
   */
  @Transaction()
  @Mutation()
  @Allow(Permission.Public)
  async resetPassword(
    @Ctx() ctx: RequestContext,
    @Args() args: { token: string; password: string },
    @Context('req') req: SessionTokenArgs['req'],
    @Context('res') res: SessionTokenArgs['res'],
  ) {
    const resetResult = await this.administratorService.resetPassword(
      ctx,
      args.token,
      args.password,
    )
    if (isGraphQlErrorResult(resetResult)) {
      return resetResult
    }
    const session = await this.authService.authenticate(ctx, 'admin', NATIVE_AUTH_STRATEGY_NAME, {
      username: resetResult.identifier,
      password: args.password,
    })
    if (isGraphQlErrorResult(session)) {
      if (
        session instanceof InvalidCredentialsError &&
        session.authenticationError === TwoFactorAuthError.REQUIRED
      ) {
        return { id: resetResult.id, identifier: resetResult.identifier, channels: [] }
      }
      // Unreachable in practice: the password was just set. Throw, as core does.
      throw session
    }
    setSessionToken({
      req,
      res,
      authOptions: this.configService.authOptions,
      rememberMe: false,
      sessionToken: session.token,
    })
    return {
      id: session.user.id,
      identifier: session.user.identifier,
      channels: getUserChannelsPermissions(session.user),
    }
  }
}

@Resolver()
export class TwoFactorAdminResolver {
  constructor(
    private twoFactorService: TwoFactorService,
    private userService: UserService,
    private administratorService: AdministratorService,
  ) {}

  @Query()
  @Allow(Permission.Owner)
  async activeAdministratorTwoFactor(@Ctx() ctx: RequestContext) {
    return this.twoFactorService.getStatus(ctx, await this.activeUser(ctx))
  }

  @Transaction()
  @Mutation()
  @Allow(Permission.Owner)
  async beginTwoFactorEnrolment(@Ctx() ctx: RequestContext, @Args() args: { password: string }) {
    return this.twoFactorService.beginEnrolment(ctx, await this.activeUser(ctx), args.password)
  }

  @Transaction()
  @Mutation()
  @Allow(Permission.Owner)
  async confirmTwoFactorEnrolment(@Ctx() ctx: RequestContext, @Args() args: { code: string }) {
    return this.twoFactorService.confirmEnrolment(ctx, (await this.activeUser(ctx)).id, args.code)
  }

  @Transaction()
  @Mutation()
  @Allow(Permission.Owner)
  async disableTwoFactor(@Ctx() ctx: RequestContext, @Args() args: { code: string }) {
    return this.twoFactorService.disable(ctx, await this.activeUser(ctx), args.code)
  }

  @Transaction()
  @Mutation()
  @Allow(Permission.Owner)
  async regenerateTwoFactorBackupCodes(@Ctx() ctx: RequestContext, @Args() args: { code: string }) {
    return this.twoFactorService.regenerateBackupCodes(
      ctx,
      (await this.activeUser(ctx)).id,
      args.code,
    )
  }

  @Transaction()
  @Mutation()
  @Allow(resetTwoFactorPermission.Permission)
  async resetAdministratorTwoFactor(
    @Ctx() ctx: RequestContext,
    @Args() args: { administratorId: ID },
  ) {
    const administrator = await this.administratorService.findOne(ctx, args.administratorId)
    if (!administrator) {
      return { success: false, error: 'NOT_ENABLED' }
    }
    const reset = await this.twoFactorService.reset(ctx, administrator.user.id)
    return reset ? { success: true } : { success: false, error: 'NOT_ENABLED' }
  }

  private async activeUser(ctx: RequestContext): Promise<User> {
    const user = ctx.activeUserId
      ? await this.userService.getUserById(ctx, ctx.activeUserId)
      : undefined
    if (!user) {
      throw new ForbiddenError()
    }
    return user
  }
}

@Resolver('Administrator')
export class AdministratorTwoFactorEntityResolver {
  constructor(
    private twoFactorService: TwoFactorService,
    private administratorService: AdministratorService,
  ) {}

  @ResolveField()
  async twoFactorEnabled(@Ctx() ctx: RequestContext, @Parent() administrator: Administrator) {
    const userId =
      administrator.user?.id ??
      (await this.administratorService.findOne(ctx, administrator.id))?.user.id
    return userId ? this.twoFactorService.isEnabledForUser(ctx, userId) : false
  }
}
