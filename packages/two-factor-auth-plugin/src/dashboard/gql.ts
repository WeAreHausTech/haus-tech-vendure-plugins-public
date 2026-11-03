export type TwoFactorErrorCode =
  | 'INVALID_CODE'
  | 'INVALID_PASSWORD'
  | 'CHALLENGE_EXPIRED'
  | 'LOCKED'
  | 'ALREADY_ENABLED'
  | 'NOT_ENABLED'
  | 'NO_PENDING_ENROLMENT'
  | 'REQUIRED'

export interface EnrolmentSecret {
  secret: string
  otpauthUri: string
  qrCodeDataUrl: string
}

const enrolmentFields = /* GraphQL */ `
  enrolment {
    secret
    otpauthUri
    qrCodeDataUrl
  }
`

export const twoFactorLoginDocument = /* GraphQL */ `
  mutation TwoFactorLogin($username: String!, $password: String!) {
    twoFactorLogin(username: $username, password: $password) {
      status
      challengeToken
      ${enrolmentFields}
    }
  }
`
export interface TwoFactorLoginResult {
  twoFactorLogin: {
    status: 'NOT_REQUIRED' | 'CODE_REQUIRED' | 'ENROLMENT_REQUIRED' | 'INVALID_CREDENTIALS'
    challengeToken: string | null
    enrolment: EnrolmentSecret | null
  }
}

export const completeLoginEnrolmentDocument = /* GraphQL */ `
  mutation CompleteTwoFactorLoginEnrolment($challengeToken: String!, $code: String!) {
    completeTwoFactorLoginEnrolment(challengeToken: $challengeToken, code: $code) {
      success
      error
      backupCodes
    }
  }
`

export const authenticateTwoFactorDocument = /* GraphQL */ `
  mutation AuthenticateTwoFactor($challengeToken: String!, $code: String, $rememberMe: Boolean) {
    authenticate(
      input: { twoFactor: { challengeToken: $challengeToken, code: $code } }
      rememberMe: $rememberMe
    ) {
      __typename
      ... on InvalidCredentialsError {
        authenticationError
      }
      ... on ErrorResult {
        message
      }
    }
  }
`
export interface AuthenticateTwoFactorResult {
  authenticate: { __typename: string; authenticationError?: string; message?: string }
}

export const meChannelsDocument = /* GraphQL */ `
  query TwoFactorMeChannels {
    me {
      channels {
        id
        token
      }
    }
  }
`
export interface MeChannelsResult {
  me: { channels: Array<{ id: string; token: string }> } | null
}

export const twoFactorStatusDocument = /* GraphQL */ `
  query ActiveAdministratorTwoFactor {
    activeAdministratorTwoFactor {
      enabled
      enabledAt
      required
      backupCodesRemaining
    }
  }
`
export interface TwoFactorStatusResult {
  activeAdministratorTwoFactor: {
    enabled: boolean
    enabledAt: string | null
    required: boolean
    backupCodesRemaining: number
  }
}

export const beginEnrolmentDocument = /* GraphQL */ `
  mutation BeginTwoFactorEnrolment($password: String!) {
    beginTwoFactorEnrolment(password: $password) {
      success
      error
      ${enrolmentFields}
    }
  }
`

export const confirmEnrolmentDocument = /* GraphQL */ `
  mutation ConfirmTwoFactorEnrolment($code: String!) {
    confirmTwoFactorEnrolment(code: $code) {
      success
      error
      backupCodes
    }
  }
`

export const disableDocument = /* GraphQL */ `
  mutation DisableTwoFactor($code: String!) {
    disableTwoFactor(code: $code) {
      success
      error
    }
  }
`

export const regenerateBackupCodesDocument = /* GraphQL */ `
  mutation RegenerateTwoFactorBackupCodes($code: String!) {
    regenerateTwoFactorBackupCodes(code: $code) {
      success
      error
      backupCodes
    }
  }
`

export const resetAdministratorDocument = /* GraphQL */ `
  mutation ResetAdministratorTwoFactor($administratorId: ID!) {
    resetAdministratorTwoFactor(administratorId: $administratorId) {
      success
      error
    }
  }
`

export const administratorTwoFactorDocument = /* GraphQL */ `
  query AdministratorTwoFactorEnabled($id: ID!) {
    administrator(id: $id) {
      id
      twoFactorEnabled
    }
  }
`

export interface TwoFactorMutationResult {
  success: boolean
  error: TwoFactorErrorCode | null
  backupCodes?: string[] | null
  enrolment?: EnrolmentSecret | null
}

const errorMessages: Record<string, string> = {
  INVALID_CODE: 'That code is not valid. Check the time on your device and try again.',
  INVALID_PASSWORD: 'The password is not correct.',
  CHALLENGE_EXPIRED: 'The sign-in took too long. Please start again.',
  LOCKED: 'Too many wrong codes. Two-factor sign-in is locked for a while.',
  ALREADY_ENABLED: 'Two-factor authentication is already enabled.',
  NOT_ENABLED: 'Two-factor authentication is not enabled.',
  NO_PENDING_ENROLMENT: 'Start the setup again.',
  REQUIRED: 'Two-factor authentication is required for your account and cannot be turned off.',
  TWO_FACTOR_INVALID_CODE: 'That code is not valid. Check the time on your device and try again.',
  TWO_FACTOR_CHALLENGE_EXPIRED: 'The sign-in took too long. Please start again.',
  TWO_FACTOR_LOCKED: 'Too many wrong codes. Two-factor sign-in is locked for a while.',
  TWO_FACTOR_ENROLMENT_INCOMPLETE: 'Finish setting up your authenticator app first.',
}

export function errorMessage(code: string | null | undefined): string {
  return (code && errorMessages[code]) || 'Something went wrong. Please try again.'
}
