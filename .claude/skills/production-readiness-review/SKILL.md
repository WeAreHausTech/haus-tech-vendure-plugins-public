---
name: production-readiness-review
description: Router for release readiness: config parity, migrations, rollback, and validation evidence.
---

# Production Readiness Review

## Use when

- User asks for ship checklist, release risk review, or go-live readiness on a defined release or change set.
- There is a bounded set of services, packages, or migrations to assess.

## Do not use when

- Pure feature design with no release surface.
- No definition of what ships (ask for release boundary first).

## Router

1. Load `references/conventions.md` for naming, do/don't, and forbidden patterns.
2. Identify release unit (service, package, or version bump).
3. Load `references/signals.md` for what to scan in repo (config, migrations, health).
4. Load `references/evidence.md` for how to record **verified vs not verified**.
5. Load `references/rollback.md` when deployment or migration risk exists.

Stay factual: evidence and gaps, not generic praise.

## References

- references/signals.md
- references/evidence.md
- references/rollback.md
