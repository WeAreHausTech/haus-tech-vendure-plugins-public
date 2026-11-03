import path from 'path'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import {
  AttemptedLoginEvent,
  AuthenticatedSession,
  EventBus,
  mergeConfig,
  NativeAuthenticationMethod,
  TransactionalConnection,
} from '@vendure/core'
import {
  createTestEnvironment,
  registerInitializer,
  SimpleGraphQLClient,
  SqljsInitializer,
  testConfig,
} from '@vendure/testing'
import gql from 'graphql-tag'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { base32Decode, hotp, timeStep } from '../src/crypto/totp'
import { TwoFactorAuthPlugin } from '../src/two-factor-auth.plugin'
import { initialData } from './fixtures/initial-data'

const sqliteDataDir = path.join(__dirname, '__data__')
/** Bump when Vendure upgrades or entity changes alter the sqljs schema (invalidates cached e2e DB). */
const SQLITE_SCHEMA_VERSION = '3.8-two-factor-1'

async function ensureFreshE2eDatabase(): Promise<void> {
  const versionFile = path.join(sqliteDataDir, '.schema-version')
  let storedVersion: string | undefined
  try {
    storedVersion = (await readFile(versionFile, 'utf8')).trim()
  } catch {
    // no version file yet
  }
  if (storedVersion !== SQLITE_SCHEMA_VERSION) {
    await rm(sqliteDataDir, { recursive: true, force: true })
    await mkdir(sqliteDataDir, { recursive: true })
    await writeFile(versionFile, SQLITE_SCHEMA_VERSION, 'utf8')
  }
}

registerInitializer('sqljs', new SqljsInitializer(sqliteDataDir))

const GET_SUPERADMIN_ROLE = gql`
  query Roles {
    roles {
      items {
        id
        code
      }
    }
  }
`
const CREATE_ADMINISTRATOR = gql`
  mutation CreateAdministrator($input: CreateAdministratorInput!) {
    createAdministrator(input: $input) {
      id
      emailAddress
    }
  }
`
const LOGIN = gql`
  mutation Login($username: String!, $password: String!) {
    login(username: $username, password: $password) {
      __typename
      ... on CurrentUser {
        identifier
      }
      ... on InvalidCredentialsError {
        authenticationError
      }
    }
  }
`
const AUTHENTICATE_NATIVE = gql`
  mutation AuthenticateNative($username: String!, $password: String!) {
    authenticate(input: { native: { username: $username, password: $password } }) {
      __typename
      ... on InvalidCredentialsError {
        authenticationError
      }
    }
  }
`
const AUTHENTICATE_TWO_FACTOR = gql`
  mutation AuthenticateTwoFactor($challengeToken: String!, $code: String) {
    authenticate(input: { twoFactor: { challengeToken: $challengeToken, code: $code } }) {
      __typename
      ... on CurrentUser {
        identifier
      }
      ... on InvalidCredentialsError {
        authenticationError
      }
    }
  }
`
const TWO_FACTOR_LOGIN = gql`
  mutation TwoFactorLogin($username: String!, $password: String!) {
    twoFactorLogin(username: $username, password: $password) {
      status
      challengeToken
      expiresAt
      enrolment {
        secret
        otpauthUri
        qrCodeDataUrl
      }
    }
  }
`
const COMPLETE_LOGIN_ENROLMENT = gql`
  mutation CompleteLoginEnrolment($challengeToken: String!, $code: String!) {
    completeTwoFactorLoginEnrolment(challengeToken: $challengeToken, code: $code) {
      success
      error
      backupCodes
    }
  }
`
const ME = gql`
  query Me {
    me {
      identifier
    }
  }
`
const STATUS = gql`
  query Status {
    activeAdministratorTwoFactor {
      enabled
      enabledAt
      required
      backupCodesRemaining
    }
  }
`
const BEGIN_ENROLMENT = gql`
  mutation Begin($password: String!) {
    beginTwoFactorEnrolment(password: $password) {
      success
      error
      enrolment {
        secret
        otpauthUri
        qrCodeDataUrl
      }
    }
  }
`
const CONFIRM_ENROLMENT = gql`
  mutation Confirm($code: String!) {
    confirmTwoFactorEnrolment(code: $code) {
      success
      error
      backupCodes
    }
  }
`
const DISABLE = gql`
  mutation Disable($code: String!) {
    disableTwoFactor(code: $code) {
      success
      error
    }
  }
`
const REGENERATE = gql`
  mutation Regenerate($code: String!) {
    regenerateTwoFactorBackupCodes(code: $code) {
      success
      error
      backupCodes
    }
  }
`
const RESET_OTHER = gql`
  mutation Reset($administratorId: ID!) {
    resetAdministratorTwoFactor(administratorId: $administratorId) {
      success
      error
    }
  }
`
const ADMIN_TWO_FACTOR_ENABLED = gql`
  query Admin($id: ID!) {
    administrator(id: $id) {
      id
      twoFactorEnabled
    }
  }
`
const REQUEST_PASSWORD_RESET = gql`
  mutation RequestReset($emailAddress: String!) {
    requestPasswordReset(emailAddress: $emailAddress) {
      __typename
    }
  }
`
const RESET_PASSWORD = gql`
  mutation ResetPassword($token: String!, $password: String!) {
    resetPassword(token: $token, password: $password) {
      __typename
      ... on CurrentUser {
        identifier
      }
    }
  }
`

const alice = {
  firstName: 'Alice',
  lastName: 'Admin',
  emailAddress: 'alice@example.com',
  password: 'alice-pw',
}
const bob = {
  firstName: 'Bob',
  lastName: 'Admin',
  emailAddress: 'bob@example.com',
  password: 'bob-pw',
}
const carol = {
  firstName: 'Carol',
  lastName: 'Admin',
  emailAddress: 'carol@example.com',
  password: 'carol-pw',
}

describe('TwoFactorAuthPlugin e2e', () => {
  const config = mergeConfig(testConfig, {
    apiOptions: { port: 3080 },
    plugins: [
      TwoFactorAuthPlugin.init({
        encryptionKeys: [randomBytes(32).toString('base64')],
        issuer: 'E2E Shop',
        // Carol must use a second factor; everyone else may choose.
        required: (_ctx, user) => user.identifier === carol.emailAddress,
      }),
    ],
  })
  const { server, adminClient } = createTestEnvironment(config)
  /** A second browser, for sessions on "another device". */
  const otherDevice = new SimpleGraphQLClient(config, 'http://localhost:3080/admin-api')

  const adminIds: Record<string, string> = {}
  let aliceSecret = ''
  let aliceBackupCodes: string[] = []

  // Only Date.now() is moved: the plugin reads the time through it, while core keeps real
  // Date objects (faking the Date class breaks core's session cache).
  let clockOffset = 0
  const realNow = Date.now.bind(Date)
  const advanceClock = (ms: number) => {
    clockOffset += ms
  }

  /** Moves the clock one TOTP step on, so each sign-in has an unused step. */
  const freshCode = (secret: string) => {
    advanceClock(30_000)
    return hotp(base32Decode(secret), timeStep(Date.now()))
  }

  const wrongCode = (secret: string) => {
    const right = hotp(base32Decode(secret), timeStep(Date.now()))
    return right === '000000' ? '111111' : '000000'
  }

  const signInWithCode = async (user: typeof alice, code: string) => {
    await adminClient.asAnonymousUser()
    const { twoFactorLogin } = await adminClient.query(TWO_FACTOR_LOGIN, {
      username: user.emailAddress,
      password: user.password,
    })
    expect(twoFactorLogin.status).toBe('CODE_REQUIRED')
    const { authenticate } = await adminClient.query(AUTHENTICATE_TWO_FACTOR, {
      challengeToken: twoFactorLogin.challengeToken,
      code,
    })
    return authenticate
  }

  const sessionCount = async (identifier: string) => {
    const connection = server.app.get(TransactionalConnection).rawConnection
    return connection.getRepository(AuthenticatedSession).count({ where: { user: { identifier } } })
  }

  beforeAll(async () => {
    await ensureFreshE2eDatabase()
    await server.init({ initialData })
    await adminClient.asSuperAdmin()
    const { roles } = await adminClient.query(GET_SUPERADMIN_ROLE)
    const superAdminRole = roles.items.find(
      (role: { code: string }) => role.code === '__super_admin_role__',
    )
    for (const admin of [alice, bob, carol]) {
      const { createAdministrator } = await adminClient.query(CREATE_ADMINISTRATOR, {
        input: { ...admin, roleIds: [superAdminRole.id] },
      })
      adminIds[admin.emailAddress] = createAdministrator.id
    }
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + clockOffset)
  }, 120_000)

  afterAll(async () => {
    vi.restoreAllMocks()
    await server.destroy()
  })

  describe('an administrator without a second factor', () => {
    it('signs in with login as before', async () => {
      await adminClient.asAnonymousUser()
      const { login } = await adminClient.query(LOGIN, {
        username: bob.emailAddress,
        password: bob.password,
      })
      expect(login).toEqual({ __typename: 'CurrentUser', identifier: bob.emailAddress })
    })

    it('gets NOT_REQUIRED from twoFactorLogin, and no challenge', async () => {
      await adminClient.asAnonymousUser()
      const { twoFactorLogin } = await adminClient.query(TWO_FACTOR_LOGIN, {
        username: bob.emailAddress,
        password: bob.password,
      })
      expect(twoFactorLogin).toMatchObject({ status: 'NOT_REQUIRED', challengeToken: null })
    })

    it('gets INVALID_CREDENTIALS for a wrong password', async () => {
      const { twoFactorLogin } = await adminClient.query(TWO_FACTOR_LOGIN, {
        username: bob.emailAddress,
        password: 'wrong',
      })
      expect(twoFactorLogin.status).toBe('INVALID_CREDENTIALS')
    })

    it('publishes AttemptedLoginEvent for the password step, like login does', async () => {
      const attempts: string[] = []
      const subscription = server.app
        .get(EventBus)
        .ofType(AttemptedLoginEvent)
        .subscribe((event) => attempts.push(`${event.strategy}:${event.identifier}`))
      await adminClient.query(TWO_FACTOR_LOGIN, { username: bob.emailAddress, password: 'wrong' })
      await new Promise((resolve) => setTimeout(resolve, 50))
      subscription.unsubscribe()
      expect(attempts).toEqual([`native:${bob.emailAddress}`])
    })
  })

  describe('enrolment while signed in', () => {
    it('refuses a wrong password', async () => {
      await adminClient.asUserWithCredentials(alice.emailAddress, alice.password)
      const { beginTwoFactorEnrolment } = await adminClient.query(BEGIN_ENROLMENT, {
        password: 'wrong',
      })
      expect(beginTwoFactorEnrolment).toMatchObject({
        success: false,
        error: 'INVALID_PASSWORD',
        enrolment: null,
      })
    })

    it('returns a secret, otpauth URI and QR code', async () => {
      const { beginTwoFactorEnrolment } = await adminClient.query(BEGIN_ENROLMENT, {
        password: alice.password,
      })
      expect(beginTwoFactorEnrolment.success).toBe(true)
      const { secret, otpauthUri, qrCodeDataUrl } = beginTwoFactorEnrolment.enrolment
      expect(secret).toMatch(/^[A-Z2-7]{32}$/)
      expect(otpauthUri).toContain(`secret=${secret}`)
      expect(otpauthUri).toContain('issuer=E2E+Shop')
      expect(qrCodeDataUrl).toMatch(/^data:image\/png;base64,/)
      aliceSecret = secret
    })

    it('refuses a wrong first code', async () => {
      const { confirmTwoFactorEnrolment } = await adminClient.query(CONFIRM_ENROLMENT, {
        code: wrongCode(aliceSecret),
      })
      expect(confirmTwoFactorEnrolment).toMatchObject({ success: false, error: 'INVALID_CODE' })
    })

    it('enables the second factor, returns backup codes and signs out other sessions', async () => {
      await otherDevice.asUserWithCredentials(alice.emailAddress, alice.password)
      expect(await sessionCount(alice.emailAddress)).toBe(2)
      const connection = server.app.get(TransactionalConnection).rawConnection

      const { confirmTwoFactorEnrolment } = await adminClient.query(CONFIRM_ENROLMENT, {
        code: freshCode(aliceSecret),
      })
      expect(confirmTwoFactorEnrolment.success).toBe(true)
      expect(confirmTwoFactorEnrolment.backupCodes).toHaveLength(10)
      aliceBackupCodes = confirmTwoFactorEnrolment.backupCodes

      expect(await sessionCount(alice.emailAddress)).toBe(1)
      const stored = await connection.query(
        `SELECT secret, backupCodeHashes FROM two_factor_credential`,
      )
      expect(stored[0].secret).not.toContain(aliceSecret)
      expect(stored[0].backupCodeHashes).not.toContain(aliceBackupCodes[0])

      const { activeAdministratorTwoFactor } = await adminClient.query(STATUS)
      expect(activeAdministratorTwoFactor).toMatchObject({
        enabled: true,
        required: false,
        backupCodesRemaining: 10,
      })
    })

    it('shows twoFactorEnabled on the administrator', async () => {
      await adminClient.asSuperAdmin()
      const enabled = await adminClient.query(ADMIN_TWO_FACTOR_ENABLED, {
        id: adminIds[alice.emailAddress],
      })
      const disabled = await adminClient.query(ADMIN_TWO_FACTOR_ENABLED, {
        id: adminIds[bob.emailAddress],
      })
      expect(enabled.administrator.twoFactorEnabled).toBe(true)
      expect(disabled.administrator.twoFactorEnabled).toBe(false)
    })
  })

  describe('signing in with a second factor', () => {
    it('refuses login with the password alone, and creates no session', async () => {
      await adminClient.asAnonymousUser()
      const sessionsBefore = await sessionCount(alice.emailAddress)
      const { login } = await adminClient.query(LOGIN, {
        username: alice.emailAddress,
        password: alice.password,
      })
      expect(login).toEqual({
        __typename: 'InvalidCredentialsError',
        authenticationError: 'TWO_FACTOR_REQUIRED',
      })
      expect(await sessionCount(alice.emailAddress)).toBe(sessionsBefore)
      await expect(adminClient.query(ME)).rejects.toThrow(/not currently authorized/)
    })

    it('refuses authenticate({ native }) with the password alone', async () => {
      const { authenticate } = await adminClient.query(AUTHENTICATE_NATIVE, {
        username: alice.emailAddress,
        password: alice.password,
      })
      expect(authenticate.authenticationError).toBe('TWO_FACTOR_REQUIRED')
    })

    it('does not reveal a second factor for a wrong password', async () => {
      const { login } = await adminClient.query(LOGIN, {
        username: alice.emailAddress,
        password: 'wrong',
      })
      expect(login).toEqual({ __typename: 'InvalidCredentialsError', authenticationError: '' })
    })

    it('signs in with the challenge and a TOTP code', async () => {
      const result = await signInWithCode(alice, freshCode(aliceSecret))
      expect(result).toEqual({ __typename: 'CurrentUser', identifier: alice.emailAddress })
      const { me } = await adminClient.query(ME)
      expect(me.identifier).toBe(alice.emailAddress)
    })

    it('refuses a code from a time step that was already used', async () => {
      const code = freshCode(aliceSecret)
      expect((await signInWithCode(alice, code)).__typename).toBe('CurrentUser')
      expect(await signInWithCode(alice, code)).toEqual({
        __typename: 'InvalidCredentialsError',
        authenticationError: 'TWO_FACTOR_INVALID_CODE',
      })
    })

    it('redeems a challenge only once', async () => {
      await adminClient.asAnonymousUser()
      const { twoFactorLogin } = await adminClient.query(TWO_FACTOR_LOGIN, {
        username: alice.emailAddress,
        password: alice.password,
      })
      const first = await adminClient.query(AUTHENTICATE_TWO_FACTOR, {
        challengeToken: twoFactorLogin.challengeToken,
        code: freshCode(aliceSecret),
      })
      expect(first.authenticate.__typename).toBe('CurrentUser')
      const second = await adminClient.query(AUTHENTICATE_TWO_FACTOR, {
        challengeToken: twoFactorLogin.challengeToken,
        code: freshCode(aliceSecret),
      })
      expect(second.authenticate.authenticationError).toBe('TWO_FACTOR_CHALLENGE_EXPIRED')
    })

    it('refuses an expired challenge', async () => {
      await adminClient.asAnonymousUser()
      const { twoFactorLogin } = await adminClient.query(TWO_FACTOR_LOGIN, {
        username: alice.emailAddress,
        password: alice.password,
      })
      advanceClock(301_000)
      const { authenticate } = await adminClient.query(AUTHENTICATE_TWO_FACTOR, {
        challengeToken: twoFactorLogin.challengeToken,
        code: hotp(base32Decode(aliceSecret), timeStep(Date.now())),
      })
      expect(authenticate.authenticationError).toBe('TWO_FACTOR_CHALLENGE_EXPIRED')
    })

    it('accepts a backup code once', async () => {
      const [code] = aliceBackupCodes
      expect((await signInWithCode(alice, code.toUpperCase())).__typename).toBe('CurrentUser')
      expect((await signInWithCode(alice, code)).authenticationError).toBe(
        'TWO_FACTOR_INVALID_CODE',
      )
    })

    it('locks the second factor after repeated wrong codes', async () => {
      // One wrong code was already counted by the backup code test above.
      for (let i = 0; i < 3; i++) {
        expect((await signInWithCode(alice, wrongCode(aliceSecret))).authenticationError).toBe(
          'TWO_FACTOR_INVALID_CODE',
        )
      }
      expect((await signInWithCode(alice, wrongCode(aliceSecret))).authenticationError).toBe(
        'TWO_FACTOR_LOCKED',
      )
      expect((await signInWithCode(alice, freshCode(aliceSecret))).authenticationError).toBe(
        'TWO_FACTOR_LOCKED',
      )

      advanceClock(901_000)
      expect((await signInWithCode(alice, freshCode(aliceSecret))).__typename).toBe('CurrentUser')
    })
  })

  describe('managing the second factor', () => {
    it('regenerates backup codes with a valid code', async () => {
      const { regenerateTwoFactorBackupCodes } = await adminClient.query(REGENERATE, {
        code: freshCode(aliceSecret),
      })
      expect(regenerateTwoFactorBackupCodes.backupCodes).toHaveLength(10)
      expect(regenerateTwoFactorBackupCodes.backupCodes).not.toContain(aliceBackupCodes[1])
      aliceBackupCodes = regenerateTwoFactorBackupCodes.backupCodes
    })

    it('refuses to disable with a wrong code', async () => {
      const { disableTwoFactor } = await adminClient.query(DISABLE, {
        code: wrongCode(aliceSecret),
      })
      expect(disableTwoFactor).toEqual({ success: false, error: 'INVALID_CODE' })
    })

    it('disables with a backup code, after which the password alone works again', async () => {
      const { disableTwoFactor } = await adminClient.query(DISABLE, { code: aliceBackupCodes[0] })
      expect(disableTwoFactor).toEqual({ success: true, error: null })
      await adminClient.asAnonymousUser()
      const { login } = await adminClient.query(LOGIN, {
        username: alice.emailAddress,
        password: alice.password,
      })
      expect(login.__typename).toBe('CurrentUser')
    })
  })

  describe('an administrator who must use a second factor', () => {
    let challengeToken = ''
    let carolSecret = ''

    it('is refused by login', async () => {
      await adminClient.asAnonymousUser()
      const { login } = await adminClient.query(LOGIN, {
        username: carol.emailAddress,
        password: carol.password,
      })
      expect(login.authenticationError).toBe('TWO_FACTOR_REQUIRED')
    })

    it('is asked to enrol by twoFactorLogin', async () => {
      const { twoFactorLogin } = await adminClient.query(TWO_FACTOR_LOGIN, {
        username: carol.emailAddress,
        password: carol.password,
      })
      expect(twoFactorLogin.status).toBe('ENROLMENT_REQUIRED')
      expect(twoFactorLogin.enrolment.secret).toMatch(/^[A-Z2-7]{32}$/)
      challengeToken = twoFactorLogin.challengeToken
      carolSecret = twoFactorLogin.enrolment.secret
    })

    it('cannot redeem the challenge before confirming enrolment', async () => {
      const { authenticate } = await adminClient.query(AUTHENTICATE_TWO_FACTOR, { challengeToken })
      expect(authenticate.authenticationError).toBe('TWO_FACTOR_ENROLMENT_INCOMPLETE')
      await expect(adminClient.query(ME)).rejects.toThrow(/not currently authorized/)
    })

    it('confirms enrolment and then signs in with the same challenge', async () => {
      const wrong = await adminClient.query(COMPLETE_LOGIN_ENROLMENT, {
        challengeToken,
        code: wrongCode(carolSecret),
      })
      expect(wrong.completeTwoFactorLoginEnrolment).toMatchObject({
        success: false,
        error: 'INVALID_CODE',
      })

      const { completeTwoFactorLoginEnrolment } = await adminClient.query(
        COMPLETE_LOGIN_ENROLMENT,
        {
          challengeToken,
          code: freshCode(carolSecret),
        },
      )
      expect(completeTwoFactorLoginEnrolment.backupCodes).toHaveLength(10)

      const { authenticate } = await adminClient.query(AUTHENTICATE_TWO_FACTOR, { challengeToken })
      expect(authenticate).toEqual({ __typename: 'CurrentUser', identifier: carol.emailAddress })
    })

    it('cannot disable the second factor', async () => {
      const { activeAdministratorTwoFactor } = await adminClient.query(STATUS)
      expect(activeAdministratorTwoFactor).toMatchObject({ enabled: true, required: true })
      const { disableTwoFactor } = await adminClient.query(DISABLE, {
        code: freshCode(carolSecret),
      })
      expect(disableTwoFactor.error).toBe('REQUIRED')
    })

    it('can be reset by another administrator, which signs them out everywhere', async () => {
      expect(await sessionCount(carol.emailAddress)).toBeGreaterThan(0)
      await adminClient.asSuperAdmin()
      const { resetAdministratorTwoFactor } = await adminClient.query(RESET_OTHER, {
        administratorId: adminIds[carol.emailAddress],
      })
      expect(resetAdministratorTwoFactor.success).toBe(true)
      expect(await sessionCount(carol.emailAddress)).toBe(0)

      await adminClient.asAnonymousUser()
      const { twoFactorLogin } = await adminClient.query(TWO_FACTOR_LOGIN, {
        username: carol.emailAddress,
        password: carol.password,
      })
      expect(twoFactorLogin.status).toBe('ENROLMENT_REQUIRED')
    })

    it('refuses the reset mutation to an anonymous caller', async () => {
      await adminClient.asAnonymousUser()
      await expect(
        adminClient.query(RESET_OTHER, { administratorId: adminIds[carol.emailAddress] }),
      ).rejects.toThrow(/not currently authorized/)
    })
  })

  describe('password reset', () => {
    const resetTokenFor = async (emailAddress: string) => {
      await adminClient.asAnonymousUser()
      await adminClient.query(REQUEST_PASSWORD_RESET, { emailAddress })
      const connection = server.app.get(TransactionalConnection).rawConnection
      const method = await connection
        .getRepository(NativeAuthenticationMethod)
        .findOne({ where: { identifier: emailAddress } })
      return method!.passwordResetToken!
    }

    it('resets the password of an administrator with a second factor without signing them in', async () => {
      const token = await resetTokenFor(carol.emailAddress)
      const sessionsBefore = await sessionCount(carol.emailAddress)
      const { resetPassword } = await adminClient.query(RESET_PASSWORD, {
        token,
        password: 'carol-new-pw',
      })
      expect(resetPassword).toEqual({ __typename: 'CurrentUser', identifier: carol.emailAddress })
      expect(await sessionCount(carol.emailAddress)).toBe(sessionsBefore)
      await expect(adminClient.query(ME)).rejects.toThrow(/not currently authorized/)

      const { twoFactorLogin } = await adminClient.query(TWO_FACTOR_LOGIN, {
        username: carol.emailAddress,
        password: 'carol-new-pw',
      })
      expect(twoFactorLogin.status).toBe('ENROLMENT_REQUIRED')
      carol.password = 'carol-new-pw'
    })

    it('still signs in an administrator without a second factor, as core does', async () => {
      const token = await resetTokenFor(bob.emailAddress)
      const { resetPassword } = await adminClient.query(RESET_PASSWORD, {
        token,
        password: 'bob-new-pw',
      })
      expect(resetPassword).toEqual({ __typename: 'CurrentUser', identifier: bob.emailAddress })
      const { me } = await adminClient.query(ME)
      expect(me.identifier).toBe(bob.emailAddress)
    })

    it('passes core errors through', async () => {
      await adminClient.asAnonymousUser()
      const { resetPassword } = await adminClient.query(RESET_PASSWORD, {
        token: 'nope',
        password: 'x',
      })
      expect(resetPassword.__typename).toBe('PasswordResetTokenInvalidError')
    })
  })
})
