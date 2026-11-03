# ADR-0005: Administrator 2FA creates no session before the second factor

- **Status:** Proposed
- **Date:** 2026-11-03
- **Decided by:** Tim Cifuentes Vargas (draft by Claude)
- **Affects:** packages/two-factor-auth-plugin (all of it); repo dev dependencies (Vendure 3.8.1)
- **Related:** branch feat/two-factor-auth-plugin

## Context

Vendure has no two-factor authentication and no plugin for it. Sessions are created by authentication strategies, and the Dashboard login page only offers slots before and after its form, with no second step. Before 3.8.0, a session created on the Shop API also worked on the Admin API.

## Decision

The plugin wraps the Admin API `native` strategy under the same name. For an administrator who has 2FA on, or must have it, a correct password is refused. A separate `twoFactorLogin` mutation checks the password and issues a short-lived, single-use challenge, and a new `twoFactor` strategy creates the session from that challenge plus a TOTP or backup code. Secrets are encrypted with AES-256-GCM. Challenges, counters and used time steps live in the database and are spent with conditional updates. The plugin replaces the core `resetPassword` resolver so a reset does not sign in with the password alone. In the Dashboard, the stock login redirects to the plugin's own sign-in page. The plugin requires Vendure ^3.8.0. Version 1 covers administrators only.

## Motivation (why)

No session exists until the second factor passes, so the plugin fails closed: a route that forgets a check, or a disabled plugin, never hands out a half-authenticated session. Database state works across server instances without extra infrastructure. 3.8.0 is the first version that keeps Shop API sessions off the Admin API, which would otherwise bypass the second factor.

## Alternatives considered

- Create the session first and flag it "pending 2FA", enforced by a guard or entity access control: keeps the stock login form, but fails open wherever the check is missing.
- Fork or patch core `AuthService`: costs every user an upgrade burden.
- Append the code to the password: no UI work, but unusable and breaks password managers.
- `otplib` for TOTP: fine, but the algorithm is about 60 lines on Node `crypto` with RFC test vectors, and a smaller dependency tree suits a security package.

## Consequences

- Projects add a migration for two tables and keep an encryption key with their secrets.
- Projects on Vendure older than 3.8.0 must upgrade first.
- The legacy Angular Admin UI cannot sign in an administrator who has 2FA on.
- API keys and other authentication strategies (SSO) are not covered; the README says so.
- The reset-password redirect depends on how the stock Dashboard page behaves after a reset; an upstream `login.form` slot or post-reset hook would remove that.
