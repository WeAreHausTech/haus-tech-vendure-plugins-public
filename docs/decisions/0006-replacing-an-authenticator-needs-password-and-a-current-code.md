# ADR-0006: Replacing an authenticator needs the password and a current code

- **Status:** Proposed
- **Date:** 2026-11-19
- **Decided by:** Tim Cifuentes Vargas (draft by Claude)
- **Affects:** packages/two-factor-auth-plugin (`TwoFactorService`, Admin API schema, Dashboard settings page, `TwoFactorEvent`)
- **Related:** ADR-0005; branch feat/two-factor-replace-authenticator

## Context

An administrator who has a second factor could not change the authenticator behind it. Starting enrolment again is refused while 2FA is on, and a required administrator cannot turn it off first. An administrator with a new phone, or one who never saved the secret in their app, therefore needed another administrator with `ResetTwoFactor`, which signs them out everywhere, or database access when nobody else can sign in.

## Decision

A signed-in administrator replaces their own authenticator with two new Admin API mutations. `beginTwoFactorReplacement(password, code)` takes the password plus a code from the current authenticator or a backup code, and stores a new secret as pending. `confirmTwoFactorReplacement(code)` takes the first code from the new authenticator. Only then does the new secret replace the old one: new backup codes are issued, the old ones stop working, the administrator's other sessions are signed out, and a `replaced` event is published. The plugin sends no email itself; the README shows how a project sends one from the event.

## Motivation (why)

Asking for the password and a current code means neither a stolen session nor a stolen password alone can bind an attacker's authenticator. Activating the new secret only after its first code keeps an administrator from locking themselves out with an app that was never saved. Dropping the old backup codes and other sessions follows the same rule as enrolment: whatever was tied to the old factor may be in someone else's hands. Email stays out of the plugin so it needs no templates or transport of its own.

## Alternatives considered

- Let `beginTwoFactorEnrolment` run while 2FA is on: fewer mutations, but it changes what `ALREADY_ENABLED` means for existing clients and hides a second proof behind an optional argument.
- The session alone, or the session plus password: simpler, but a stolen session or password would be enough to take over the second factor.
- Use _Reset 2FA_ on yourself: works only for administrators with `ResetTwoFactor`, signs out every session and leaves the account without a second factor until the next sign-in.
- Send the notification email from the plugin: every project would have to configure templates and a sender for it.
- An expiry on the pending secret: it needs a new column and a migration in every project, and signed-in enrolment has none either. Left out for now, see Consequences.

## Consequences

- No migration: the pending secret uses the existing `pendingSecret` column, which was only used before 2FA was on.
- A backup code used to start a replacement is spent even when the replacement is never confirmed.
- A started replacement stays pending until it is confirmed or a new one is started. Confirming it takes a signed-in session and the first code from the pending secret, so someone who saw that QR code and later holds a session could finish it. An expiry would close this and needs a migration.
- Wrong codes at either step count toward the existing lockout, which also blocks sign-in while it lasts.
- Projects that want the administrator told about a replacement add an email handler for the `replaced` event.
- `TwoFactorEventType` gains a member, so a project with an exhaustive switch over it gets a compile error until it handles `replaced`.
