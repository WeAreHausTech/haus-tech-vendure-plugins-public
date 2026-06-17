# Scope signals

Prioritize when present in scope:

- Auth: session, JWT, OIDC callback, permission checks
- Data: SQL/NoSQL query construction, user input to shell, HTML/JSON sinks
- Config: CORS, cookies, TLS, debug flags in prod paths
- Dependencies: known-dangerous patterns in lockfile or config (surface only; deep audit is manual)

If signal absent in scope, say **not applicable** instead of padding.
