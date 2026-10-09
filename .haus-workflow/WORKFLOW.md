<!-- HAUS-MANAGED id=template.workflow v=1 source=@haus-tech/haus-workflow@5.12.1 hash=sha256-d9fb7169eed9a263d1e9352cfe89d99b3f4a26694316230f89ddfc5609fb525d -->
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
| Decision log  | `docs/decisions/`                                                     |
| Glossary      | `GLOSSARY.md` at the repo root (domain terms; no open questions)      |
| Research      | `docs/research/YYYY-MM-DD-<slug>.md` (dated; evidence, never a rule)  |
| Failure modes | `docs/runbook.md`                                                     |

When the user or an installed skill says "spec", "design", "ux", "plan", "mockup", "ADR" or "decision": resolve to the rows above. These paths override the defaults inside any installed skill (`docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/adr/`).

---

## Feature workflow

The loop is explore, plan, code, commit. The superpowers plugin carries the how (brainstorming, writing-plans, using-git-worktrees, test-driven-development, verification-before-completion, requesting-code-review, finishing-a-development-branch). This section sets the gates.

**Escape hatch:** if you can describe the whole diff in one sentence (typo, copy tweak, one-line fix), go straight to code. Planning is for changes that touch multiple files, are architecturally uncertain, or live in unfamiliar code.

1. **Explore.** Read spec, design, UX, mockups, the glossary and the code you will touch. No edits, no plan, no questions before this.
2. **Align intent.** State all assumptions, flag every gap and conflict between inputs, list what is ambiguous. Stop and wait for explicit user OK before writing a plan. When this step runs as an interview (any skill), ask one question per message and wait for the answer, even when the skill tells you to ask several questions or a whole round at once. Number the question, give options and a recommended answer, and look facts up instead of asking. Write each term to the glossary as it settles, and every other settled answer to the spec or plan it changes or, when neither exists yet, to an interview record under `docs/research/`. In the record, quote the human's answer as given; label any reasoning the human did not state as the assistant's. Draft ADRs only at the closing confirmation, for the decisions that meet the ADR bar. That confirmation is this step's OK and approves nothing further.
3. **Plan.** Discrete tasks, each with testable acceptance criteria, exact verification commands, dependencies on other tasks and a source-doc reference. Save to `docs/plans/<slug>.md`. Stop and wait for explicit user OK before executing.
4. **Isolate.** Never edit on `main`: a feature branch or a worktree under `.claude/worktrees/<slug>` (gitignored).
5. **Code.** Sequential unless tasks are independent (no shared state, no ordering), then parallel subagents, each in its own worktree. Every task gets a pass/fail signal (test, build, lint, screenshot vs mockup): implement, run the check, read the result, fix, repeat. When a bug surfaces, diagnose the root cause before writing any fix.
6. **Commit.** Adversarial code review in fresh context before merging, then present merge / PR / cleanup options. Docs ship with the change: if setup, commands, env, deploy or integrations changed, run the writing-documentation skill (`/docs`) in the same PR, or state that docs are N/A. After a major milestone, capture lessons as issues via the out-of-scope rule (`/retro`, where installed, proposes them; file only the ones the human picks); lessons about haus-shipped content go upstream as `needs-triage` issues through the issue-authoring skill's routing rule (catalog content to `WeAreHausTech/haus-workflow-catalog`, the haus program and the skills and agents it ships itself to `WeAreHausTech/haus-workflow`), project-local lessons stay in this repo's issues.

**Skills that survey or interview** (an architecture review, a retro, a grilling) only propose: what the human picks enters this loop at Align intent. Start one on a branch (a worktree only from a clean, committed state) if it may edit docs. After a compaction or resume, load the skill you were running again before you continue.

---

## NEVER rules

Apply even in unattended mode. `.claude/settings.json` already denies force pushes, `--no-verify`, `gh pr merge --admin`, publishing and secret-file reads; the rules below are the ones only you can keep.

- **NEVER commit or push without explicit user OK**, unless inside an approved plan (plan approval = blanket exec authority for that plan's scope only).
- Never work directly on `main`. Always a branch or worktree (the Lefthook `branch-guard` stage enforces this where installed).
- Never rewrite published history (amend, rebase then force). Breaks anyone who pulled.
- Never delete a branch with unmerged work without explicit OK.
- Never commit secrets, credentials, tokens or API keys. They are permanent in git history.
- **NEVER encode ambiguity silently.** Ambiguity means stop and ask. Record the resolution in its home: an ADR when it meets the ADR bar, otherwise the spec or plan it changes.

---

## Git

- Squash-merge: `gh pr merge <n> --squash --delete-branch`. Never plain `--merge`.
- Conventional Commits: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `ci`, `perf`. Scope by domain: `feat(auth):`.
- Closing keywords in a PR body: one keyword per issue, one per line (`Closes #1`, then `Closes #2` on its own line). `Closes #1, #2` closes only #1. They work only when the PR targets the default branch, and another repo's issue needs `owner/repo#123`. Close only what the PR actually finishes.

---

## Testing rules (non-negotiable)

No task is done until tests pass locally. All new code ships with tests.

| Layer                         | Minimum bar                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Pure logic / domain functions | TDD. Test first, code second. Cover happy path + edge cases + invariants.                   |
| UI components                 | One render-and-interact test per public component. Query by role/label, not class names.    |
| Backend / data layer          | One integration test per repository function, against a local emulator/test DB, never prod. |
| Critical user flows           | One happy-path E2E per critical journey.                                                    |

**Verification gate:** run the suite for every touched layer and record the passing output in the task's verification block. Untested = unfinished.

**Highest-stakes logic** (financial, auth, medical, pedagogical, and whatever `workflow-config.md` names) is TDD-only: write the test from the spec before any implementation. No exceptions.

**Precedence:** this table is the house testing bar. A rule file installed under `.claude/rules/` (for example `common/testing.md`) adds stack-specific technique on top; where it states a different general bar (a flat coverage percentage, "all test types required", blanket-mandatory TDD), this table wins.

See `workflow-config.md` for this project's test commands.

---

## Pre-commit hooks

Lefthook. `lefthook.yml` holds this project's stages; the `haus.lefthook-security` and `haus.lefthook-quality` templates hold the house baseline (typecheck, lint, format and secret scan on pre-commit, unit tests on pre-push). Never gate E2E in hooks. Write `fail_text` as instructions the agent can act on. Add CI when a second developer joins, a broken commit reaches main, or before the first public release.

---

## Security defaults

- **Default deny.** Access-control layers (DB rules, RLS, middleware) start denied, opened explicitly.
- **Security rules are implementation.** Write them in the same task as the feature they protect.
- **Validate at boundaries.** Parse and validate user input, API responses, env vars with a schema library. Trust internal types downstream.
- **OWASP Top 10 check** before any new public route: injection, broken auth, IDOR, SSRF, misconfiguration.
- **Dependency audit** on a regular cadence. Block critical findings before release.
- **No remote scripts in generated reports.** A report or prototype an agent generates about this codebase inlines its assets and loads nothing from a CDN, even when a skill's scaffold does.

---

## Architecture Decision Records (ADR)

ADRs capture why a significant choice was made. The machine drafts; the human approves.

Write one when choosing a library or framework, defining a data or security model, picking a merge or deploy strategy, setting an API contract, or resolving a spec conflict. For any other decision, offer one only when it is hard to reverse, would surprise a reader who lacks the context, and came from a real trade-off. These two sentences are the ADR bar.

- Location: `docs/decisions/NNNN-kebab-case-title.md`. Index: `docs/decisions/README.md`, one line per ADR with its why, imported from `CLAUDE.md`.
- Write-once. To change one, add a new ADR that supersedes it. Statuses: `Proposed`, `Accepted`, `Deprecated`, `Superseded by ADR-XXXX`.
- Template and procedure: the `adr-decisions` skill. `haus decisions suggest` drafts from the diff; `haus decisions check` gates CI.
- **One writer: `adr-decisions`.** When another skill tells you to record, offer or edit an ADR (`domain-modeling` and the skills that call it), use that skill only to judge whether the decision deserves a record, then write the record through `adr-decisions`: house template, `docs/decisions/`, next number, README row, status Proposed until a human approves. That skill's own ADR format, directory and numbering do not apply here.

---

## Runbook

Maintain `docs/runbook.md`: one entry per non-obvious failure resolved, with the exact symptom, the root cause and the exact fix command.

---

## Where facts live

Each fact has exactly one home. Never duplicate across layers.

| Layer                              | What goes here                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| Hook, lint rule or CI check        | A rule a machine can enforce. Build the check before writing prose.                  |
| `AGENTS.md` / `CLAUDE.md`          | Stable rules, commands, conventions. Loaded every session, so keep it small.         |
| `.claude/rules/*.md` with `paths:` | Rules that only matter in one part of the tree. Loaded when a matching file is read. |
| Auto memory (`MEMORY.md`)          | Learnings the agent discovers (build quirks, debug insights, patterns).              |
| ADR (`docs/decisions/`)            | Architectural decisions, library choices, policy. Permanent, write-once.             |
| Runbook (`docs/runbook.md`)        | Failure modes + exact fix. Permanent, append-only.                                   |
| `workflow-config.md`               | Doc paths, test commands, highest-stakes, tool choices. Project-owned.               |

This table outranks any skill's advice about what `CLAUDE.md`, `AGENTS.md` or a standards file should hold. A project's own path-scoped rules go in `.claude/rules/project/`. A change to haus-shipped content (a skill, agent, catalog rule, template or this standard), proposed by any skill or audit, becomes an upstream issue, never a local edit.

Rule of thumb: ADR for WHY, runbook for HOW TO FIX, memory for what was LEARNED, `CLAUDE.md` for the stable RULES, `workflow-config.md` for the project-specific VALUES.

---

## Subagents

Every spawned agent needs a self-contained prompt: file paths, relevant decisions, expected output format. No implicit context from the parent session. Independent investigations or feature modules run in parallel, each in its own worktree; a state-dependent pipeline runs sequentially; a specific failure gets one agent with full context.

---

## Out-of-scope capture

When you notice out-of-scope work worth keeping (a bug found mid-task, scope deferred from a plan, an idea a human explicitly asks you to record), spawn the `issue-creator` agent instead of a background-task chip. Chips die with the session; issues persist and reach the whole team.

- Findings and deferred scope: file automatically, labelled `needs-triage`. Ideas: only when a human asks; auto-filed ideas bury real bugs.
- Findings about haus-shipped content (a skill, agent, template, or this standard) route upstream through the issue-authoring skill's routing rule: catalog content to `WeAreHausTech/haus-workflow-catalog`, the haus program and the skills and agents it ships itself to `WeAreHausTech/haus-workflow`. Never put client code or client-identifying detail in an upstream issue.
- No GitHub issues available (no remote, `gh` missing or unauthenticated, issues disabled): create a background-task chip instead and say so in your final message.
- Nothing in a filed issue is implemented before human sign-off.

---

## Stop conditions (unattended mode)

Stop and ask the user when verification fails 3+ times on the same task, a spec/design/UX conflict needs a product decision, a security hole cannot be closed without new requirements, or build or tests are red after rebase.
