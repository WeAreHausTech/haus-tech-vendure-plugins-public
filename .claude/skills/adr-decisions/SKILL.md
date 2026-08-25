---
name: adr-decisions
description: >-
  Draft and gate Architecture Decision Records (ADRs) when changes are decision-worthy.
  Use when `haus decisions suggest` fires, when adding deps/schema/auth/API changes,
  or when the user asks why a choice was made. Machine drafts; human approves.
---

# ADR decisions

Captures **why** significant choices were made under `docs/decisions/`.

## Use when

- `haus decisions suggest` or the Stop hook proposes an ADR
- A change touches dependencies, schema, auth, public APIs, CI, or infrastructure
- The user asks "why did we choose X?" before coding an alternative

## When to skip

Gate carve-outs live in the haus CLI algorithm (not `decisions-triggers.json`). Use this table:

| Change | ADR needed? |
| --- | --- |
| Dependency version bump, no dep added/removed | No |
| New or removed dependency | Yes |
| Lockfile-only regen (no package.json change) | No |
| Catalog sync (`chore/sync-catalog-*` branch, or `library/catalog/**`) | No |
| Schema/migration/CI/infra/API-contract/auth path | Yes (security paths: `[adr-skip]` ignored) |
| 8+ files across 2+ top-level dirs (not a dep bump) | Yes |
| Docs/tests-only | No (already exempt) |

## Workflow

1. Run `haus decisions suggest` (or use the Stop-hook JSON draft).
2. Present the draft to the user — **never** mark `Accepted` without explicit approval.
3. On approval: write `docs/decisions/NNNN-slug.md` and add a README index row with a one-line **why**.
4. Commit the ADR in the same PR as the code change.

## Do not

- Hand-author ADRs without pulling context from the diff and conversation
- Skip the README index update
- Reach for `[adr-skip]` on security/auth paths — the gate ignores it; write the ADR instead

## Commands

```bash
haus decisions suggest          # draft from staged/unstaged diff
haus decisions check --staged   # local gate
haus decisions next-number      # next NNNN
haus decisions validate path    # structure check
```

Index lives at `docs/decisions/README.md` — keep it `@import`ed from `CLAUDE.md`.
