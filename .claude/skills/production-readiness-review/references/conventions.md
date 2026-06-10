## Naming conventions

- Evidence markers: `✅ Verified` (file read + confirmed), `⚠️ Not verified` (not checked), `N/A` (not applicable with reason)
- Section heading for rollback: `## Rollback` (exact case)
- Finding format: `path/to/file.ts — SEVERITY: description — recommendation`
- Severity scale (descending): `blocker`, `high`, `medium`, `low`
- Review document sections: `## Summary`, `## Files Reviewed`, `## Checks`, `## Rollback`, `## Verdict`

## Do / don't

DO: List every file actually read in `## Files Reviewed` — DON'T: claim to have reviewed files not opened in this session
DO: Name the exact commands a human must run (e.g. `php artisan migrate:rollback --step=1`) — DON'T: give vague rollback instructions like "reverse the migration"
DO: Mark every skipped check explicitly as `N/A` with a one-line reason — DON'T: silently omit sections from the review
DO: Include a `## Rollback` section whenever migrations or infra changes are present — DON'T: omit rollback steps when schema changes exist
DO: Document the rollback order explicitly (e.g. "1. revert deploy, 2. run down migration") — DON'T: assume rollback order is obvious
DO: Separate production-readiness findings from feature-quality feedback — DON'T: mix performance suggestions with readiness blockers

## Forbidden patterns

NEVER: Mark a config file as `✅ Verified` without having read it — false safety signal
NEVER: Omit `## Rollback` section when migrations exist — rollback path must always be documented
NEVER: Invent command output or assert behavior without running or reading the artifact — fabricated evidence
NEVER: Report rollback steps in undefined order when ordering matters — out-of-order rollback causes data loss
NEVER: Mark an auth or permission check as low severity without documented justification — under-reporting auth issues
