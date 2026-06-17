# Agentic Development Workflow Standard

> Tech-agnostic methodology for AI-assisted software projects.

---

## Source-of-truth documents

| Workflow term | Default path                                                          |
| ------------- | --------------------------------------------------------------------- |
| Spec          | `docs/SPEC.md`                                                        |
| Design        | `docs/DESIGN.md`                                                      |
| UX flows      | `docs/UX.md`                                                          |
| Mockups       | `docs/design/` (gitignore binaries, commit README.txt)                |
| Plans         | `docs/plans/<feature-slug>.md` (one per feature, persist after merge) |
| Decision log  | `docs/adr/`                                                           |
| Failure modes | `docs/runbook.md`                                                     |

When the user says "spec", "design", "ux", "plan", or "mockup": resolve to the rows above.

---

## How to write rules that stick

- **Specific beats general.** "Run `npm test` before commit" over "test your changes". "Handlers live in `src/api/`" over "keep files organised".
- **Emphasis raises adherence.** Reserve `NEVER` / `YOU MUST` / `IMPORTANT` for the few rules that matter most. Overuse dilutes them.
- **State the reason.** A rule with its WHY survives edge cases; a bare rule gets rationalised away.

---

## Feature workflow

The canonical loop is **explore -> plan -> code -> commit**. Steps below expand it. Steps are ordered — do not skip.

**Escape hatch:** if you can describe the whole diff in one sentence (typo, copy tweak, one-line fix), skip to step 5. Planning is for changes that touch multiple files, are architecturally uncertain, or live in unfamiliar code. Do not ceremony-tax trivial work.

**1. Explore. Read inputs.**
Read spec, design, UX, mockups, and the code you will touch. No edits, no plan, no questions before this.

**2. Align intent.**
State all assumptions. Flag every gap and conflict between inputs. List what is ambiguous.
**Stop. Wait for explicit user OK before writing a plan.**

**3. Write a plan.**
Break into discrete tasks. Each task requires: acceptance criteria (testable, not aspirational), verification steps (exact commands or manual checks), dependencies on other tasks, reference to source doc.
Save to `docs/plans/<slug>.md`.
**Stop. Wait for explicit user OK before executing.**

**4. Create an isolated workspace.**
NEVER edit on `main`. Create a feature branch or git worktree.

```bash
git worktree add .claude/worktrees/<slug> -b feat/<slug>
# .claude/worktrees/ must be in .gitignore
```

**5. Code.**
Work tasks sequentially unless independent (no shared state, no ordering dependency) — then dispatch parallel subagents, each in its own worktree.
All new code ships with tests. **Give every task a verifiable signal** (test, build, lint, screenshot vs mockup) and loop in one pass: implement -> run the check -> read the result -> fix -> repeat until it passes. Without a pass/fail signal, "looks done" is the only signal and you are the verification loop.
**When a bug surfaces: stop, diagnose root cause methodically before writing any fix.** Do not patch symptoms.

**6. Commit.**
Before merging: conduct a code review (adversarial, fresh context). Present merge / PR / cleanup options to the user.
After merging a major milestone: capture lessons learned and feed them to the standards backlog.

---

## NEVER rules

Apply even in unattended mode. Reasons are included — rules without context get overridden.

- **NEVER commit or push without explicit user OK**, unless inside an approved plan (plan approval = blanket exec authority for that plan's scope only).
- **NEVER use `git push --force`** on a published branch. Destroys history others may have pulled.
- **NEVER use `--no-verify`** on commit or push. Bypasses the quality gates hooks enforce.
- **NEVER rewrite history** on published commits (amend, rebase-with-force). Breaks anyone who pulled.
- **NEVER commit secrets**, credentials, tokens, or API keys. They are permanent in git history.
- **NEVER delete a branch** with unmerged work without explicit OK.
- **NEVER work directly on `main`.** Always a branch or worktree.
- **NEVER encode ambiguity silently.** Ambiguity = stop and ask. Log resolution as ADR.

---

## Settings: deterministic enforcement

CLAUDE.md/AGENTS.md rules are advisory. `settings.json` permissions are deterministic. Critical NEVER rules must be enforced in both.

Add to `.claude/settings.json`:

```json
{
  "permissions": {
    "deny": [
      "Bash(git commit --no-verify:*)",
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Read(.env)",
      "Write(.env)",
      "Read(*.pem)",
      "Write(*.pem)",
      "Read(*.key)",
      "Write(*.key)"
    ]
  }
}
```

---

## Git

- **Squash-merge:** `gh pr merge <n> --squash --delete-branch`. Never plain `--merge`.
- **Conventional Commits:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `ci`, `perf`. Scope by domain: `feat(auth):`.

---

## Testing rules (non-negotiable)

No task is done until tests pass locally. All new code ships with tests.

| Layer                         | Minimum bar                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Pure logic / domain functions | TDD. Test first, code second. Cover happy path + edge cases + invariants.                |
| UI components                 | One render-and-interact test per public component. Query by role/label, not class names. |
| Backend / data layer          | One integration test per repository function. Hits local emulator/test DB, never prod.   |
| Critical user flows           | One happy-path E2E per critical journey.                                                 |

**Verification gate:** run the test suite for all touched layers and record passing output in the task's verification block. Untested = unfinished.

**Highest-stakes logic** (e.g. financial, auth, medical, pedagogical) is TDD-only: write the test from the spec before any implementation. No exceptions.

See `workflow-config.md` for this project's test commands.

---

## Pre-commit hooks

Use [Lefthook](https://github.com/evilmartians/lefthook) (Go binary, no Node dependency, faster than Husky). Write `fail_text` with agent-readable instructions — the agent reads hook output to decide what to fix.

Gate every commit on (parallel):

1. Type check
2. Lint
3. Format
4. Secret scan: `! git diff --cached | grep -iE "(password|secret|token|api_key)\\s*[:=]\\s*['\"]"`

Gate unit tests on pre-push (slow). Never gate E2E in hooks.

See `lefthook.yml` (or your pre-commit config) for this project's exact hook commands.

```yaml
pre-commit:
  parallel: true
  commands:
    lint:
      run: npm run lint
      fail_text: 'Lint failed. Run `npm run lint -- --fix` to auto-fix, re-stage, then commit.'
    typecheck:
      run: npm run typecheck
      fail_text: 'Type errors found. Fix all type errors before committing.'
```

**CI trigger.** Start with local hooks only. Add CI when: a second developer joins, a broken commit reaches main, or before first public release.

---

## Security defaults

- **Default deny.** Access-control layers (DB rules, RLS, middleware) start denied, opened explicitly.
- **Security rules are implementation.** Write them in the same task as the feature they protect.
- **Validate at boundaries.** Parse and validate user input, API responses, env vars with a schema library. Trust internal types downstream.
- **OWASP Top 10 check** before any new public route: injection, broken auth, IDOR, SSRF, misconfiguration.
- **Dependency audit** on a regular cadence. Block critical findings before release.

---

## Architecture Decision Records (ADR)

Write an ADR when: choosing a library or framework, defining a data or security model, picking a merge or deploy strategy, setting an API contract, or resolving a spec conflict. If you would otherwise make an assumption: write an ADR instead.

- Location: `docs/adr/`, filename: `NNNN-kebab-case-title.md`
- Write-once. To change: new ADR that "Supersedes ADR-NNNN". Statuses: `Proposed`, `Accepted`, `Deprecated`, `Superseded by ADR-XXXX`.
- Maintain index table in `docs/adr/README.md`.

```markdown
# ADR-NNNN: [Title]

- **Status:** Accepted | **Date:** YYYY-MM-DD

## Context

## Decision

## Consequences

## Alternatives considered
```

---

## Runbook

Maintain `docs/runbook.md`. One entry per non-obvious failure resolved.

```markdown
## [Short symptom]

**Symptom:** [exact error] **Cause:** [root cause] **Fix:** [exact command]
```

---

## Where facts live

Each fact has exactly one home. Never duplicate across layers.

| Layer                       | What goes here                                                         | Load behaviour                                                     |
| --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `AGENTS.md` / `CLAUDE.md`   | Stable rules, commands, conventions                                    | Loaded in full, every session. Keep small.                         |
| Auto memory (`MEMORY.md`)   | Learnings the agent discovers (build quirks, debug insights, patterns) | First ~200 lines / 25 KB loaded. Accumulates without manual edits. |
| ADR (`docs/adr/`)           | Architectural decisions, library choices, policy                       | On demand. Permanent, write-once.                                  |
| Runbook (`docs/runbook.md`) | Failure modes + exact fix                                              | On demand. Permanent, append-only.                                 |
| `workflow-config.md`        | Doc paths, test commands, highest-stakes, tool choices                 | Loaded with WORKFLOW.md. Project-owned.                            |

Rule of thumb: ADR for WHY, runbook for HOW TO FIX, memory for what was LEARNED, `AGENTS.md` for the stable RULES, `workflow-config.md` for the project-specific VALUES.

---

## Subagent patterns

| Situation                           | Pattern                                   |
| ----------------------------------- | ----------------------------------------- |
| Multiple independent investigations | Parallel agents                           |
| Independent feature modules         | Parallel agents, each in its own worktree |
| State-dependent pipeline            | Sequential                                |
| Debugging a specific failure        | Single agent with full context            |

Each spawned agent needs a self-contained prompt: file paths, relevant decisions, expected output format. No implicit context from the parent session.

---

## Context management

Context is the primary constraint. Performance degrades as the window fills.

- **Clear between unrelated tasks.** Reset context (`/clear`) when switching to something unrelated. A long session carrying stale context underperforms a fresh one.
- **Delegate investigation to subagents.** Reading 50 files to answer one question pollutes the main window. Send it to a subagent; keep only the conclusion.
- **Correct early.** If the agent drifts, stop and redirect immediately. If you correct the same thing twice, clear and restart with a sharper prompt instead of piling on corrections.
- **Checkpoint before risky changes.** Use rewind/checkpoints so a bad path is one undo away, not a manual revert.

---

## Stop conditions (unattended mode)

Stop and ask the user when:

- Verification fails 3+ times on the same task.
- A spec/design/UX conflict requires a product decision.
- A security hole cannot be closed without new requirements.
- Build or tests are red after rebase.

---

## Accessibility floor

- Status never by colour alone: colour + icon + text.
- Touch targets: 44x44 px minimum on touch interfaces.
- Contrast: WCAG AA against background.
- Reduced-motion fallbacks for all state-conveying animations.
- All interactive elements are keyboard-navigable and have accessible labels.

---

## Multi-tool usage

`@`-import syntax (e.g. `@AGENTS.md`) works in Claude Code only. Other tools read files directly.

```
Claude Code:  CLAUDE.md       → @AGENTS.md (inline)
Cursor:       .cursorrules    → copy sections directly (no @-import)
Gemini:       GEMINI.md       → copy sections directly
All tools:    AGENTS.md       = canonical source of truth, edit here
```
