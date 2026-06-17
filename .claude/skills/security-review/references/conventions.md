## Naming conventions

- Finding format: `path/to/file.ts:line — SEVERITY: issue description — concrete fix`
- Severity labels (descending): `blocker`, `high`, `medium`, `low`
- Review sections: `## Scope`, `## Findings`, `## Files Reviewed`, `## Unrun Checks`, `## Verdict`
- Unrun check entries: `[ ] <check name> — reason not run`
- Evidence for "clean": `No findings in <path> — <why it is safe>`

## Do / don't

DO: List every file actually read in `## Files Reviewed` — DON'T: claim coverage of files not opened
DO: Name explicit unrun checks (SAST, CVE scan, secret scan) in `## Unrun Checks` if not performed — DON'T: omit the section or claim scans ran when they did not
DO: Provide a concrete fix for every finding (e.g. "wrap with `$wpdb->prepare()`") — DON'T: write "validate input" without specifying how
DO: Rate auth bypass, injection, and broken access control findings as `blocker` or `high` — DON'T: downgrade their severity without documented justification
DO: Read redacted excerpts only — refuse to read unredacted `.env` files, private keys, or customer data exports — DON'T: process secrets even if the user provides them
DO: Distinguish between confirmed vulnerabilities and theoretical risks — DON'T: report theoretical risks at the same severity as confirmed issues

## Forbidden patterns

NEVER: Recommend `__return_true` as a `permission_callback` — grants public access to any authenticated or anonymous caller
NEVER: Mark an auth bypass or privilege escalation finding as `low` without documented justification — critical risk under-reporting
NEVER: Produce exploit code or working proof-of-concept payloads — out of scope for review
NEVER: Skip the `## Verification` / `## Unrun Checks` section — incomplete review cannot be relied upon
NEVER: Read unredacted secrets or customer exports — even in a review context
NEVER: Assert a finding is "not exploitable" without reading the relevant code path — blind assertion
