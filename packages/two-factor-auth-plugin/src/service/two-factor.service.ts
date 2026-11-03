import { Inject, Injectable } from '@nestjs/common'
import {
  AttemptedLoginEvent,
  AuthenticatedSession,
  ConfigService,
  EventBus,
  ID,
  Logger,
  NATIVE_AUTH_STRATEGY_NAME,
  RequestContext,
  SessionService,
  TransactionalConnection,
  User,
  UserService,
} from '@vendure/core'
import { toDataURL } from 'qrcode'
import { LessThan } from 'typeorm'

import { loggerCtx, PLUGIN_INIT_OPTIONS, TwoFactorAuthError } from '../constants'
import { SecretCipher } from '../crypto/secret-cipher'
import { generateBackupCodes, generateToken, hashBackupCode, sha256Hex } from '../crypto/tokens'
import {
  buildOtpauthUri,
  findMatchingStep,
  generateTotpSecret,
  isTotpCodeFormat,
} from '../crypto/totp'
import {
  TwoFactorChallenge,
  TwoFactorChallengePurpose,
} from '../entity/two-factor-challenge.entity'
import { TwoFactorCredential } from '../entity/two-factor-credential.entity'
import { TwoFactorNativeAuthenticationStrategy } from '../strategy/two-factor-native-authentication-strategy'
import { TwoFactorEvent, TwoFactorEventType } from '../two-factor.event'
import type {
  ResolvedTwoFactorAuthPluginOptions,
  TwoFactorBackupCodesResult,
  TwoFactorEnrolmentSecret,
  TwoFactorEnrolmentStartResult,
  TwoFactorErrorCode,
  TwoFactorLoginResult,
  TwoFactorResult,
  TwoFactorStatus,
} from '../types'

export type LoginRequirement = 'none' | 'code' | 'enrolment'
type CodeCheck = 'ok' | 'invalid' | 'locked'

const codeError = (check: Exclude<CodeCheck, 'ok'>): TwoFactorErrorCode =>
  check === 'locked' ? 'LOCKED' : 'INVALID_CODE'

const fail = (error: TwoFactorErrorCode) => ({ success: false as const, error })

/** Binds a ciphertext to its user, so a secret copied to another row does not decrypt. */
const secretOwner = (userId: ID) => `two-factor-secret:${userId}`

/**
 * @description
 * Enrolment, verification and recovery of administrators' second factor.
 *
 * Counters, replay protection and challenges live in the database, so they hold across
 * several server instances. Every state change that must not race (spending a time step,
 * a backup code or a challenge) is a conditional update that only one request can win.
 *
 * @category Services
 */
@Injectable()
export class TwoFactorService {
  private readonly cipher: SecretCipher

  constructor(
    private connection: TransactionalConnection,
    private configService: ConfigService,
    private eventBus: EventBus,
    private sessionService: SessionService,
    private userService: UserService,
    @Inject(PLUGIN_INIT_OPTIONS) private options: ResolvedTwoFactorAuthPluginOptions,
  ) {
    this.cipher = new SecretCipher(options.encryptionKeys)
  }

  async getLoginRequirement(ctx: RequestContext, user: User): Promise<LoginRequirement> {
    const credential = await this.findCredential(ctx, user.id)
    if (credential?.enabled) {
      return 'code'
    }
    return (await this.isRequired(ctx, user)) ? 'enrolment' : 'none'
  }

  /**
   * First step of a sign-in. Checks the password and, when a second factor applies, issues a
   * challenge. Never creates a session.
   */
  async beginLogin(
    ctx: RequestContext,
    username: string,
    password: string,
  ): Promise<TwoFactorLoginResult> {
    // Same event core publishes for `login`, so login monitoring still sees password attempts.
    await this.eventBus.publish(new AttemptedLoginEvent(ctx, NATIVE_AUTH_STRATEGY_NAME, username))
    const user = await this.nativeStrategy().verifyPassword(ctx, { username, password })
    if (!user) {
      return { status: 'INVALID_CREDENTIALS' }
    }
    const requirement = await this.getLoginRequirement(ctx, user)
    if (requirement === 'none') {
      return { status: 'NOT_REQUIRED' }
    }
    if (requirement === 'code') {
      const challenge = await this.createChallenge(ctx, user.id, 'login', null)
      return { status: 'CODE_REQUIRED', ...challenge }
    }
    const secret = generateTotpSecret()
    const challenge = await this.createChallenge(
      ctx,
      user.id,
      'enrolment',
      this.cipher.encrypt(secret, secretOwner(user.id)),
    )
    return {
      status: 'ENROLMENT_REQUIRED',
      ...challenge,
      enrolment: await this.enrolmentSecret(user, secret),
    }
  }

  /** Confirms an enrolment started during sign-in. The challenge can then be redeemed without a code. */
  async completeLoginEnrolment(
    ctx: RequestContext,
    challengeToken: string,
    code: string,
  ): Promise<TwoFactorBackupCodesResult> {
    const challenge = await this.findChallenge(ctx, challengeToken)
    if (
      !challenge ||
      challenge.purpose !== 'enrolment' ||
      challenge.verified ||
      !challenge.pendingSecret
    ) {
      return fail('CHALLENGE_EXPIRED')
    }
    const secret = this.cipher.decrypt(challenge.pendingSecret, secretOwner(challenge.userId))
    const step = findMatchingStep(secret, code.trim(), Date.now())
    if (step === undefined) {
      await this.registerChallengeFailure(ctx, challenge)
      return fail('INVALID_CODE')
    }
    const claimed = await this.connection
      .getRepository(ctx, TwoFactorChallenge)
      .update({ id: challenge.id, verified: false }, { verified: true, pendingSecret: null })
    if (claimed.affected !== 1) {
      return fail('CHALLENGE_EXPIRED')
    }
    const backupCodes = await this.enable(ctx, challenge.userId, secret, step)
    return { success: true, backupCodes }
  }

  /**
   * Second step of a sign-in, called by the `twoFactor` authentication strategy. Returns the
   * user to create a session for, or an `authenticationError` string.
   */
  async redeemChallenge(
    ctx: RequestContext,
    challengeToken: string,
    code: string,
  ): Promise<User | string> {
    const challenge = await this.findChallenge(ctx, challengeToken)
    if (!challenge) {
      return TwoFactorAuthError.CHALLENGE_EXPIRED
    }
    if (challenge.purpose === 'enrolment') {
      if (!challenge.verified) {
        return TwoFactorAuthError.ENROLMENT_INCOMPLETE
      }
    } else {
      const credential = await this.findCredential(ctx, challenge.userId)
      if (!credential?.enabled) {
        await this.consumeChallenge(ctx, challenge)
        return TwoFactorAuthError.CHALLENGE_EXPIRED
      }
      const result = await this.checkCode(ctx, credential, code)
      if (result === 'locked') {
        return TwoFactorAuthError.LOCKED
      }
      if (result === 'invalid') {
        await this.registerChallengeFailure(ctx, challenge)
        return TwoFactorAuthError.INVALID_CODE
      }
    }
    if (!(await this.consumeChallenge(ctx, challenge))) {
      return TwoFactorAuthError.CHALLENGE_EXPIRED
    }
    const user = await this.userService.getUserById(ctx, challenge.userId)
    // The native strategy refuses deleted and unverified users too.
    return user && !user.deletedAt && user.verified ? user : TwoFactorAuthError.CHALLENGE_EXPIRED
  }

  async getStatus(ctx: RequestContext, user: User): Promise<TwoFactorStatus> {
    const [credential, required] = await Promise.all([
      this.findCredential(ctx, user.id),
      this.isRequired(ctx, user),
    ])
    const enabled = !!credential?.enabled
    return {
      enabled,
      enabledAt: enabled ? (credential?.enabledAt ?? null) : null,
      required,
      backupCodesRemaining: enabled ? (credential?.backupCodeHashes.length ?? 0) : 0,
    }
  }

  /** Starts enrolment for a signed-in user. Needs the current password. */
  async beginEnrolment(
    ctx: RequestContext,
    user: User,
    password: string,
  ): Promise<TwoFactorEnrolmentStartResult> {
    if (!(await this.nativeStrategy().verifyUserPassword(ctx, user.id, password))) {
      return fail('INVALID_PASSWORD')
    }
    const existing = await this.findCredential(ctx, user.id)
    if (existing?.enabled) {
      return fail('ALREADY_ENABLED')
    }
    const secret = generateTotpSecret()
    const credential = existing ?? this.newCredential(user.id)
    credential.pendingSecret = this.cipher.encrypt(secret, secretOwner(user.id))
    await this.connection.getRepository(ctx, TwoFactorCredential).save(credential)
    return { success: true, enrolment: await this.enrolmentSecret(user, secret) }
  }

  /** Confirms a signed-in enrolment with the first code. Signs out the user's other sessions. */
  async confirmEnrolment(
    ctx: RequestContext,
    userId: ID,
    code: string,
  ): Promise<TwoFactorBackupCodesResult> {
    const credential = await this.findCredential(ctx, userId)
    if (credential?.enabled) {
      return fail('ALREADY_ENABLED')
    }
    if (!credential?.pendingSecret) {
      return fail('NO_PENDING_ENROLMENT')
    }
    if (this.isLocked(credential)) {
      return fail('LOCKED')
    }
    const secret = this.cipher.decrypt(credential.pendingSecret, secretOwner(userId))
    const step = findMatchingStep(secret, code.trim(), Date.now())
    if (step === undefined) {
      return fail(codeError(await this.registerFailure(ctx, credential)))
    }
    const backupCodes = await this.enable(ctx, credential, secret, step)
    await this.deleteOtherSessions(ctx, userId)
    return { success: true, backupCodes }
  }

  /** Turns the second factor off. Needs a code. Signs out the user's other sessions. */
  async disable(ctx: RequestContext, user: User, code: string): Promise<TwoFactorResult> {
    const credential = await this.findCredential(ctx, user.id)
    if (!credential?.enabled) {
      return fail('NOT_ENABLED')
    }
    if (await this.isRequired(ctx, user)) {
      return fail('REQUIRED')
    }
    const check = await this.checkCode(ctx, credential, code)
    if (check !== 'ok') {
      return fail(codeError(check))
    }
    await this.connection.getRepository(ctx, TwoFactorCredential).delete({ id: credential.id })
    await this.deleteOtherSessions(ctx, user.id)
    await this.publish(ctx, user.id, 'disabled')
    return { success: true }
  }

  /** Replaces all backup codes. Needs a code. */
  async regenerateBackupCodes(
    ctx: RequestContext,
    userId: ID,
    code: string,
  ): Promise<TwoFactorBackupCodesResult> {
    const credential = await this.findCredential(ctx, userId)
    if (!credential?.enabled) {
      return fail('NOT_ENABLED')
    }
    const check = await this.checkCode(ctx, credential, code)
    if (check !== 'ok') {
      return fail(codeError(check))
    }
    const backupCodes = generateBackupCodes(this.options.backupCodeCount)
    await this.connection
      .getRepository(ctx, TwoFactorCredential)
      .update({ id: credential.id }, { backupCodeHashes: backupCodes.map(hashBackupCode) })
    await this.publish(ctx, userId, 'backup-codes-regenerated')
    return { success: true, backupCodes }
  }

  /**
   * Removes a user's second factor and signs out all of the user's sessions, for an
   * administrator who has lost their device. Returns false when there was nothing to reset.
   */
  async reset(ctx: RequestContext, userId: ID): Promise<boolean> {
    const deleted = await this.connection.getRepository(ctx, TwoFactorCredential).delete({ userId })
    await this.connection.getRepository(ctx, TwoFactorChallenge).delete({ userId })
    if (!deleted.affected) {
      return false
    }
    await this.sessionService.deleteSessionsByUser(ctx, new User({ id: userId }))
    await this.publish(ctx, userId, 'reset', ctx.activeUserId)
    return true
  }

  /** {@link reset} by the administrator's email address, for recovery scripts. */
  async resetByIdentifier(ctx: RequestContext, identifier: string): Promise<boolean> {
    const user = await this.userService.getUserByEmailAddress(ctx, identifier, 'administrator')
    if (!user) {
      throw new Error(`No administrator found with identifier ${identifier}`)
    }
    return this.reset(ctx, user.id)
  }

  async isEnabledForUser(ctx: RequestContext, userId: ID): Promise<boolean> {
    return !!(await this.findCredential(ctx, userId))?.enabled
  }

  private async isRequired(ctx: RequestContext, user: User): Promise<boolean> {
    const { required } = this.options
    return typeof required === 'function' ? !!(await required(ctx, user)) : required
  }

  private nativeStrategy(): TwoFactorNativeAuthenticationStrategy {
    const strategy = this.configService.authOptions.adminAuthenticationStrategy.find(
      (s): s is TwoFactorNativeAuthenticationStrategy =>
        s instanceof TwoFactorNativeAuthenticationStrategy,
    )
    if (!strategy) {
      throw new Error(
        'TwoFactorAuthPlugin: the two-factor native authentication strategy is not configured',
      )
    }
    return strategy
  }

  private findCredential(ctx: RequestContext, userId: ID) {
    return this.connection.getRepository(ctx, TwoFactorCredential).findOne({ where: { userId } })
  }

  private newCredential(userId: ID) {
    return new TwoFactorCredential({
      userId,
      secret: null,
      pendingSecret: null,
      enabled: false,
      enabledAt: null,
      lastUsedStep: null,
      backupCodeHashes: [],
      failedAttempts: 0,
      lockedUntil: null,
    })
  }

  /** Pass the user's credential when it is already loaded, or the user id to create or load it. */
  private async enable(
    ctx: RequestContext,
    credentialOrUserId: TwoFactorCredential | ID,
    secret: string,
    step: number,
  ): Promise<string[]> {
    const backupCodes = generateBackupCodes(this.options.backupCodeCount)
    const credential =
      credentialOrUserId instanceof TwoFactorCredential
        ? credentialOrUserId
        : ((await this.findCredential(ctx, credentialOrUserId)) ??
          this.newCredential(credentialOrUserId))
    const { userId } = credential
    Object.assign(credential, {
      secret: this.cipher.encrypt(secret, secretOwner(userId)),
      pendingSecret: null,
      enabled: true,
      enabledAt: new Date(),
      lastUsedStep: step,
      backupCodeHashes: backupCodes.map(hashBackupCode),
      failedAttempts: 0,
      lockedUntil: null,
    })
    await this.connection.getRepository(ctx, TwoFactorCredential).save(credential)
    await this.publish(ctx, userId, 'enabled')
    return backupCodes
  }

  private async enrolmentSecret(user: User, secret: string): Promise<TwoFactorEnrolmentSecret> {
    const otpauthUri = buildOtpauthUri({
      issuer: this.options.issuer,
      account: user.identifier,
      secret,
    })
    return {
      secret,
      otpauthUri,
      qrCodeDataUrl: await toDataURL(otpauthUri, { margin: 1, width: 240 }),
    }
  }

  private isLocked(credential: TwoFactorCredential) {
    return !!credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()
  }

  /** Accepts a 6-digit TOTP code or an unused backup code. */
  private async checkCode(
    ctx: RequestContext,
    credential: TwoFactorCredential,
    rawCode: string,
  ): Promise<CodeCheck> {
    if (this.isLocked(credential)) {
      return 'locked'
    }
    const code = rawCode.trim()
    const digits = code.replace(/\s/g, '')
    if (isTotpCodeFormat(digits)) {
      const secret = this.cipher.decrypt(credential.secret!, secretOwner(credential.userId))
      const step = findMatchingStep(secret, digits, Date.now(), credential.lastUsedStep)
      if (step !== undefined && (await this.claimStep(ctx, credential, step))) {
        await this.onVerified(ctx, credential, secret)
        return 'ok'
      }
    } else if (code) {
      const hash = hashBackupCode(code)
      if (
        credential.backupCodeHashes.includes(hash) &&
        (await this.claimBackupCode(ctx, credential, hash))
      ) {
        await this.onVerified(ctx, credential, null)
        await this.publish(ctx, credential.userId, 'backup-code-used')
        return 'ok'
      }
    }
    return this.registerFailure(ctx, credential)
  }

  /** Records the time step as used. Only one request can claim a given step. */
  private async claimStep(
    ctx: RequestContext,
    credential: TwoFactorCredential,
    step: number,
  ): Promise<boolean> {
    const qb = this.connection.getRepository(ctx, TwoFactorCredential).createQueryBuilder()
    const column = qb.escape('lastUsedStep')
    const result = await qb
      .update(TwoFactorCredential)
      .set({ lastUsedStep: step })
      .where('id = :id', { id: credential.id })
      .andWhere(`(${column} IS NULL OR ${column} < :step)`, { step })
      .execute()
    return result.affected === 1
  }

  /** Removes the backup code. Compare-and-swap on the whole list, so a code is spent once. */
  private async claimBackupCode(
    ctx: RequestContext,
    credential: TwoFactorCredential,
    hash: string,
  ) {
    const qb = this.connection.getRepository(ctx, TwoFactorCredential).createQueryBuilder()
    const result = await qb
      .update(TwoFactorCredential)
      .set({ backupCodeHashes: credential.backupCodeHashes.filter((h) => h !== hash) })
      .where('id = :id', { id: credential.id })
      .andWhere(`${qb.escape('backupCodeHashes')} = :current`, {
        current: JSON.stringify(credential.backupCodeHashes),
      })
      .execute()
    return result.affected === 1
  }

  private async onVerified(
    ctx: RequestContext,
    credential: TwoFactorCredential,
    secret: string | null,
  ) {
    const changes: Partial<TwoFactorCredential> = {}
    if (credential.failedAttempts !== 0 || credential.lockedUntil) {
      changes.failedAttempts = 0
      changes.lockedUntil = null
    }
    if (secret && credential.secret && this.cipher.needsReencryption(credential.secret)) {
      changes.secret = this.cipher.encrypt(secret, secretOwner(credential.userId))
    }
    if (Object.keys(changes).length) {
      await this.connection
        .getRepository(ctx, TwoFactorCredential)
        .update({ id: credential.id }, changes)
    }
  }

  private async registerFailure(
    ctx: RequestContext,
    credential: TwoFactorCredential,
  ): Promise<'invalid' | 'locked'> {
    const repo = this.connection.getRepository(ctx, TwoFactorCredential)
    await repo.increment({ id: credential.id }, 'failedAttempts', 1)
    const current = await repo.findOne({
      where: { id: credential.id },
      select: { id: true, failedAttempts: true },
    })
    await this.publish(ctx, credential.userId, 'verification-failed')
    if ((current?.failedAttempts ?? 0) < this.options.maxFailedAttempts) {
      return 'invalid'
    }
    await repo.update(
      { id: credential.id },
      { failedAttempts: 0, lockedUntil: new Date(Date.now() + this.options.lockoutSeconds * 1000) },
    )
    Logger.warn(
      `Second factor locked for user ${credential.userId} after repeated wrong codes`,
      loggerCtx,
    )
    await this.publish(ctx, credential.userId, 'locked')
    return 'locked'
  }

  private async createChallenge(
    ctx: RequestContext,
    userId: ID,
    purpose: TwoFactorChallengePurpose,
    pendingSecret: string | null,
  ): Promise<{ challengeToken: string; expiresAt: Date }> {
    const repo = this.connection.getRepository(ctx, TwoFactorChallenge)
    // One open challenge per user; expired ones of every user are swept on the way.
    await repo.delete({ userId })
    await repo.delete({ expiresAt: LessThan(new Date(Date.now())) })
    const challengeToken = generateToken()
    const expiresAt = new Date(Date.now() + this.options.challengeTtlSeconds * 1000)
    await repo.save(
      new TwoFactorChallenge({
        tokenHash: sha256Hex(challengeToken),
        userId,
        purpose,
        expiresAt,
        attempts: 0,
        pendingSecret,
        verified: false,
      }),
    )
    return { challengeToken, expiresAt }
  }

  private async findChallenge(ctx: RequestContext, token: string) {
    if (!token) {
      return undefined
    }
    const challenge = await this.connection
      .getRepository(ctx, TwoFactorChallenge)
      .findOne({ where: { tokenHash: sha256Hex(token) } })
    return challenge && challenge.expiresAt.getTime() > Date.now() ? challenge : undefined
  }

  private async registerChallengeFailure(ctx: RequestContext, challenge: TwoFactorChallenge) {
    const repo = this.connection.getRepository(ctx, TwoFactorChallenge)
    if (challenge.attempts + 1 >= this.options.maxFailedAttempts) {
      await repo.delete({ id: challenge.id })
    } else {
      await repo.increment({ id: challenge.id }, 'attempts', 1)
    }
  }

  /** Deletes the challenge. Only one request can redeem it. */
  private async consumeChallenge(
    ctx: RequestContext,
    challenge: TwoFactorChallenge,
  ): Promise<boolean> {
    const result = await this.connection
      .getRepository(ctx, TwoFactorChallenge)
      .delete({ id: challenge.id })
    return result.affected === 1
  }

  /** Like `SessionService.deleteSessionsByUser`, but keeps the current session. */
  private async deleteOtherSessions(ctx: RequestContext, userId: ID) {
    const repo = this.connection.getRepository(ctx, AuthenticatedSession)
    const sessions = (await repo.find({ where: { user: { id: userId } } })).filter(
      (s) => s.token !== ctx.session?.token,
    )
    await repo.remove(sessions)
    const cache = this.configService.authOptions.sessionCacheStrategy
    await Promise.all(sessions.map((session) => cache.delete(session.token)))
  }

  private publish(ctx: RequestContext, userId: ID, type: TwoFactorEventType, resetByUserId?: ID) {
    return this.eventBus.publish(new TwoFactorEvent(ctx, userId, type, resetByUserId))
  }
}
