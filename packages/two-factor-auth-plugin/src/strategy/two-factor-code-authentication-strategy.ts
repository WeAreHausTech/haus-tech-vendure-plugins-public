import { AuthenticationStrategy, Injector, RequestContext, User } from '@vendure/core'
import { DocumentNode } from 'graphql'
import { gql } from 'graphql-tag'

import { TWO_FACTOR_STRATEGY_NAME } from '../constants'
import { TwoFactorService } from '../service/two-factor.service'

export interface TwoFactorAuthenticationData {
  challengeToken: string
  /** A TOTP code or a backup code. Not needed for a challenge whose enrolment was just confirmed. */
  code?: string | null
}

/**
 * @description
 * The second step of an administrator sign-in. Redeems the challenge issued by the
 * `twoFactorLogin` mutation together with a code, through the core `authenticate` mutation:
 *
 * ```graphql
 * mutation {
 *   authenticate(input: { twoFactor: { challengeToken: "...", code: "123456" } }) {
 *     ... on CurrentUser { id identifier }
 *     ... on InvalidCredentialsError { authenticationError }
 *   }
 * }
 * ```
 *
 * @category Auth
 */
export class TwoFactorCodeAuthenticationStrategy
  implements AuthenticationStrategy<TwoFactorAuthenticationData>
{
  readonly name = TWO_FACTOR_STRATEGY_NAME
  private twoFactorService: TwoFactorService

  init(injector: Injector) {
    this.twoFactorService = injector.get(TwoFactorService)
  }

  defineInputType(): DocumentNode {
    return gql`
      input TwoFactorAuthInput {
        challengeToken: String!
        code: String
      }
    `
  }

  authenticate(ctx: RequestContext, data: TwoFactorAuthenticationData): Promise<User | string> {
    return this.twoFactorService.redeemChallenge(ctx, data.challengeToken, data.code ?? '')
  }
}
