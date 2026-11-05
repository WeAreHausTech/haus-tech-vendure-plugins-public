---
name: two-factor-auth-plugin
title: Two-Factor Authentication
description: Vendure plugin that adds two-factor authentication (TOTP authenticator apps and backup codes) to administrator sign-in, in the Admin API and the React Dashboard.
version: 3.8.0
tags:
  - vendure
  - plugin
  - 2fa
  - totp
  - security
---

# Two-Factor Authentication Plugin

Adds a second factor to administrator sign-in: a 6-digit code from an authenticator app (TOTP, RFC 6238), with single-use backup codes for a lost device.

An administrator who has turned it on never gets a session from the password alone. The password step returns a short-lived challenge, and only the challenge plus a valid code creates a session.

## Features

- **Authenticator apps**: any TOTP app (1Password, Google Authenticator, Microsoft Authenticator, ...), set up from a QR code
- **Backup codes**: 10 single-use codes, stored as hashes and shown once
- **Optional or required**: let each administrator choose, require it for everyone, or decide per user (for example by role). A required administrator sets it up during sign-in, before any session exists
- **Dashboard pages**: a sign-in page that takes the second factor, a settings page to turn it on or off and renew backup codes, and a _Reset 2FA_ action on the administrator page
- **Hardened**: secrets encrypted at rest (AES-256-GCM, key rotation), a code is accepted once, wrong codes lock the second factor for a while, and the state lives in the database so it holds across server instances
- **Events**: `TwoFactorEvent` for enrolment, disabling, resets, backup code use, wrong codes and lockouts

Customer sign-in on the Shop API is not affected.

## Compatibility

- Vendure **^3.8.0**. Earlier 3.x versions accept a Shop API session on the Admin API, which would let a password alone through, so they are not supported.
- The Dashboard extension needs the `DashboardPlugin` from `@vendure/dashboard/plugin`. The legacy Angular Admin UI is not supported: with this plugin, an administrator who has turned 2FA on cannot sign in there.

## Getting started

```bash
npm install @haus-tech/two-factor-auth-plugin
```

Generate an encryption key and keep it with your other secrets:

```bash
openssl rand -base64 32
```

## Configuration

```typescript
import { DashboardPlugin } from '@vendure/dashboard/plugin'
import { TwoFactorAuthPlugin } from '@haus-tech/two-factor-auth-plugin'

export const config = {
  plugins: [
    TwoFactorAuthPlugin.init({
      encryptionKeys: [process.env.TWO_FACTOR_ENCRYPTION_KEY!],
      issuer: 'My Shop',
    }),
    DashboardPlugin.init({ route: 'dashboard', appDir: './dist/dashboard' }),
  ],
}
```

The plugin adds two database tables (`two_factor_credential`, `two_factor_challenge`). Generate and run a migration after adding it. Rebuild the Dashboard, since the plugin ships a Dashboard extension.

## Configuration options

| Option                | Type                                                    | Default   | Description                                                                                                      |
| --------------------- | ------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| `encryptionKeys`      | `string[]`                                              | none      | Required. Base64-encoded 32-byte keys. The first encrypts; older keys after it still decrypt (see Key rotation). |
| `issuer`              | `string`                                                | `Vendure` | The name shown in authenticator apps.                                                                            |
| `required`            | `boolean \| (ctx, user) => boolean \| Promise<boolean>` | `false`   | Whether an administrator must use 2FA. The function gets the `User` with its roles loaded.                       |
| `challengeTtlSeconds` | `number`                                                | `300`     | How long the challenge from the password step stays valid.                                                       |
| `maxFailedAttempts`   | `number`                                                | `5`       | Wrong codes in a row before the second factor is locked.                                                         |
| `lockoutSeconds`      | `number`                                                | `900`     | How long the lock lasts.                                                                                         |
| `backupCodeCount`     | `number`                                                | `10`      | How many backup codes to issue.                                                                                  |

Require it for every administrator with a given role:

```typescript
TwoFactorAuthPlugin.init({
  encryptionKeys: [process.env.TWO_FACTOR_ENCRYPTION_KEY!],
  required: (ctx, user) => user.roles.some((role) => role.code === '__super_admin_role__'),
})
```

### Key rotation

Put a new key first and keep the old one after it. Secrets made with the old key are re-encrypted with the new one the next time their owner signs in. Remove the old key only when no secret uses it; a secret whose key is gone can no longer be decrypted, and its owner needs a reset.

## How it works

1. The plugin wraps the Admin API `native` authentication strategy and keeps its name. For an administrator who has turned 2FA on, or who must, a correct password is refused with `authenticationError: "TWO_FACTOR_REQUIRED"`. `login` and `authenticate(input: { native })` therefore never create a session for them.
2. The `twoFactorLogin(username, password)` mutation checks the password and returns a status:
   - `NOT_REQUIRED`: sign in with `login` as usual.
   - `CODE_REQUIRED`: a `challengeToken` to redeem with a code.
   - `ENROLMENT_REQUIRED`: a `challengeToken` plus a new secret and QR code. Confirm with `completeTwoFactorLoginEnrolment(challengeToken, code)`, which returns the backup codes.
   - `INVALID_CREDENTIALS`.
3. The challenge is redeemed through the core `authenticate` mutation with the `twoFactor` strategy, which creates the session:

```graphql
mutation {
  authenticate(input: { twoFactor: { challengeToken: "...", code: "123456" } }, rememberMe: false) {
    ... on CurrentUser {
      id
      identifier
    }
    ... on InvalidCredentialsError {
      authenticationError
    }
  }
}
```

`authenticationError` is one of `TWO_FACTOR_INVALID_CODE`, `TWO_FACTOR_CHALLENGE_EXPIRED`, `TWO_FACTOR_LOCKED` or `TWO_FACTOR_ENROLMENT_INCOMPLETE`. `code` takes a TOTP code or a backup code; it is not needed after a confirmed enrolment.

Signed-in administrators manage their own second factor with `activeAdministratorTwoFactor`, `beginTwoFactorEnrolment(password)`, `confirmTwoFactorEnrolment(code)`, `disableTwoFactor(code)` and `regenerateTwoFactorBackupCodes(code)`. Turning it on or off signs out the administrator's other sessions. A required administrator cannot turn it off.

`resetAdministratorTwoFactor(administratorId)` removes another administrator's second factor and signs them out everywhere. It needs the `ResetTwoFactor` permission (superadmins have it). `Administrator.twoFactorEnabled` shows who has it on.

### Dashboard

- The stock sign-in page sends the browser to `/two-factor-login`, which signs in every administrator, with or without a second factor.
- **Settings → Two-factor authentication** turns it on or off and renews backup codes.
- The administrator detail page gets a _Reset 2FA_ button when that administrator has it on.
- After a password reset, an administrator with a second factor is sent to the sign-in page, since the new password alone does not sign them in.

### Password reset

Core's `resetPassword` signs the administrator in with the new password. The plugin replaces that resolver: the password is reset as before, and a session is only created when no second factor applies. Otherwise the result is the administrator without a session, and they sign in with the second factor.

## Recovery

- **One administrator lost their device:** they sign in with a backup code, or another administrator with `ResetTwoFactor` uses _Reset 2FA_.
- **Nobody can sign in:** run a script on the server with access to the database:

```typescript
import { bootstrapWorker, RequestContextService } from '@vendure/core'
import { TwoFactorService } from '@haus-tech/two-factor-auth-plugin'
import { config } from './vendure-config'

const { app } = await bootstrapWorker(config)
const ctx = await app.get(RequestContextService).create({ apiType: 'admin' })
await app.get(TwoFactorService).resetByIdentifier(ctx, 'superadmin@example.com')
await app.close()
```

## Security notes

- **API keys** skip the second factor by design. Treat them as the credentials they are.
- **Other authentication strategies** (SSO and the like) are not wrapped. Require MFA in the identity provider.
- **`authOptions.disableAuth`** turns all of this off; the plugin logs a warning at startup.
- **Plugin REST routes:** Vendure documents that REST controllers guarded only by admin permissions accept a Shop API session of an administrator's user. Check your own REST routes.
- **Password guessing** is not rate-limited by Vendure or by this plugin. Limit sign-in requests at your proxy.
- **Enrolment during sign-in** trusts whoever has the password the first time a required administrator signs in. Turn it on for existing administrators before you make it required, or reset their passwords first.
- Report vulnerabilities as described in [SECURITY.md](https://github.com/WeAreHausTech/haus-tech-vendure-plugins-public/blob/main/SECURITY.md).
