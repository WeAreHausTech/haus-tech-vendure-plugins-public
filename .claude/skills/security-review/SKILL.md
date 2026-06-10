---
name: security-review
description: Router for bounded security review using Haus guardrails and evidence-first output.
---

# Security Review

## Use when

- User requests security review, threat check, or hardening pass on a named scope (paths, diff, or feature).
- Review stays read-only and bounded.

## Do not use when

- User wants unbounded repo crawl or exploit development.
- No scope: ask for paths or diff first.

## Router

1. Load `references/conventions.md` for naming, do/don't, and forbidden patterns.
2. Confirm scope (files or directories). Refuse secret stores unless user provides redacted excerpts only.
3. Load `references/output-shape.md` for finding format.
4. Load `references/scope-signals.md` when classifying risks (auth, injection, data exposure).
5. Load `references/verification.md` before closing: state what was checked vs not checked.

Invoke the **security-reviewer** agent when the host supports agents; otherwise follow the same output contract manually.

## References

- references/output-shape.md
- references/scope-signals.md
- references/verification.md
