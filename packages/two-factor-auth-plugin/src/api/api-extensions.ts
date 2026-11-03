import { gql } from 'graphql-tag'

export const adminApiExtensions = gql`
  enum TwoFactorLoginStatus {
    "The password is correct and no second factor applies: sign in with login."
    NOT_REQUIRED
    "Redeem challengeToken with a code through authenticate(input: { twoFactor })."
    CODE_REQUIRED
    "Enrol with the enrolment secret, confirm with completeTwoFactorLoginEnrolment, then redeem challengeToken."
    ENROLMENT_REQUIRED
    INVALID_CREDENTIALS
  }

  enum TwoFactorErrorCode {
    INVALID_CODE
    INVALID_PASSWORD
    CHALLENGE_EXPIRED
    LOCKED
    ALREADY_ENABLED
    NOT_ENABLED
    NO_PENDING_ENROLMENT
    REQUIRED
  }

  type TwoFactorEnrolmentSecret {
    "Base32 secret, for typing into an authenticator app by hand."
    secret: String!
    otpauthUri: String!
    "The otpauth URI as a PNG QR code data URL."
    qrCodeDataUrl: String!
  }

  type TwoFactorLoginResult {
    status: TwoFactorLoginStatus!
    challengeToken: String
    expiresAt: DateTime
    enrolment: TwoFactorEnrolmentSecret
  }

  type TwoFactorResult {
    success: Boolean!
    error: TwoFactorErrorCode
  }

  type TwoFactorBackupCodesResult {
    success: Boolean!
    error: TwoFactorErrorCode
    "Shown once. Only hashes are stored."
    backupCodes: [String!]
  }

  type TwoFactorEnrolmentStartResult {
    success: Boolean!
    error: TwoFactorErrorCode
    enrolment: TwoFactorEnrolmentSecret
  }

  type TwoFactorStatus {
    enabled: Boolean!
    enabledAt: DateTime
    required: Boolean!
    backupCodesRemaining: Int!
  }

  extend type Administrator {
    twoFactorEnabled: Boolean!
  }

  extend type Query {
    activeAdministratorTwoFactor: TwoFactorStatus!
  }

  extend type Mutation {
    "First sign-in step. Checks the password and issues a challenge when a second factor applies. Never creates a session."
    twoFactorLogin(username: String!, password: String!): TwoFactorLoginResult!
    "Confirms an enrolment that twoFactorLogin started, with the first code from the new authenticator."
    completeTwoFactorLoginEnrolment(
      challengeToken: String!
      code: String!
    ): TwoFactorBackupCodesResult!
    "Starts enrolment for the signed-in administrator."
    beginTwoFactorEnrolment(password: String!): TwoFactorEnrolmentStartResult!
    confirmTwoFactorEnrolment(code: String!): TwoFactorBackupCodesResult!
    disableTwoFactor(code: String!): TwoFactorResult!
    regenerateTwoFactorBackupCodes(code: String!): TwoFactorBackupCodesResult!
    "Removes another administrator's second factor and signs them out everywhere."
    resetAdministratorTwoFactor(administratorId: ID!): TwoFactorResult!
  }
`
