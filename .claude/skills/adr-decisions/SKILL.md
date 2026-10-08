---
name: adr-decisions
description: >-
  Draft and gate Architecture Decision Records (ADRs) when changes are decision-worthy. Use
  when `haus decisions suggest` fires, when adding deps/schema/auth/API changes, or when the
  user asks why a choice was made. Machine drafts; human approves. When `haus decisions
  suggest` fires, adding deps/schema/auth/API changes, or answering why a choice was made,
  or when another skill offers to record an ADR. Trivial edits with no architectural
  consequence.
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

To waive the trigger rules, put `[adr-skip] <reason>` on its own line in the PR body or in a commit body, not the subject. A mention mid-line or in backticks does not count (CLI 5.11.0 and later). It never waives a misplaced or invalid record.

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

## When another skill offers an ADR, or the decision has no diff

Another skill (for example `domain-modeling`, or a skill that calls it) may tell you to record or offer an ADR in its own format and folder. In this repo that skill only decides whether the decision deserves a record. You write the record here: (1) run `haus decisions next-number` for the number; `haus decisions suggest` prints nothing without a decision-worthy diff, so do not wait for it; (2) create `docs/decisions/NNNN-kebab-case-title.md` from the template below; (3) add its row to `docs/decisions/README.md`; (4) status is Proposed until a human approves. Never create `docs/adr/`.

### Template

```markdown
# ADR-NNNN: [Short title]

- **Status:** Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
- **Date:** YYYY-MM-DD
- **Decided by:** [person who approved] (draft by [AI agent])
- **Affects:** [components/paths/packages]
- **Related:** [PR link, issue, related ADR numbers]

## Context

What problem or situation triggered the decision? What constraints applied?

## Decision

What we chose, in plain language — ideally one sentence.

## Motivation (why)

Why this over the alternatives. **This is the line agents read to answer "why".**

## Alternatives considered

- [Alternative] — rejected because [reason].

## Consequences

Positive and negative follow-ons. What becomes harder? What do we lock in?
```
