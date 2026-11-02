<!-- HAUS-MANAGED id=template.workflow v=1 source=@haus-tech/haus-workflow@7.2.0 hash=sha256-c02116053151777c52bd4e1323fdadbedbf07b3a6ad4e9699b5a3830c1cf7607 -->
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
| Issue tracker | `.claude/skills/issue-authoring/references/issue-tracker.md`          |

When the user or an installed skill says "spec", "design", "ux", "plan", "mockup", "ADR", "decision" or "issue tracker": resolve to the rows above. These paths override the defaults inside any installed skill (`docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/adr/`).

---

## Feature workflow

The loop is explore, plan, code, commit. The superpowers plugin carries the how (brainstorming, writing-plans, using-git-worktrees, test-driven-development, verification-before-completion, requesting-code-review, finishing-a-development-branch). This section sets the gates.

**Escape hatch:** if you can describe the whole diff in one sentence (typo, copy tweak, one-line fix), go straight to code. Planning is for changes that touch multiple files, are architecturally uncertain, or live in unfamiliar code.

1. **Explore.** Read spec, design, UX, mockups, the glossary and the code you will touch. No edits, no plan, no questions before this.
2. **Align intent.** State all assumptions, flag every gap and conflict between inputs, list what is ambiguous. Stop and wait for explicit user OK before writing a plan. A user-level `CLAUDE.md` that delegates this gate replaces the stop with a recorded assumption in the plan. When this step runs as an interview (any skill), ask one question per message and wait for the answer, even when the skill tells you to ask several questions or a whole round at once. Number the question, give options and a recommended answer, and look facts up instead of asking. Write each term to the glossary as it settles, and every other settled answer to the spec or plan it changes or, when neither exists yet, to an interview record under `docs/research/`. In the record, quote the human's answer as given; label any reasoning the human did not state as the assistant's. Draft ADRs only at the closing confirmation, for the decisions that meet the ADR bar. That confirmation is this step's OK and approves nothing further.
3. **Plan.** Discrete tasks, each with testable acceptance criteria, exact verification commands, dependencies on other tasks and a source-doc reference. Save to `docs/plans/<slug>.md`. Stop and wait for explicit user OK before executing. A user-level `CLAUDE.md` that delegates this gate replaces the stop with a recorded assumption in the plan.
4. **Isolate.** Never edit on `main`: a feature branch or a worktree under `.claude/worktrees/<slug>` (gitignored).
5. **Code.** Sequential unless tasks are independent (no shared state, no ordering), then parallel subagents, each in its own worktree. Every task gets a pass/fail signal (test, build, lint, screenshot vs mockup): implement, run the check, read the result, fix, repeat. When a bug surfaces, diagnose the root cause before writing any fix.
6. **Commit.** Adversarial code review in fresh context before merging, then check what the target branch deploys (`.haus-workflow/deploy.json`). A merge into a production or customer-visible branch is a production deploy: it needs a recorded local run (on a full-suite branch, the green full-suite status instead) and the human's explicit go. Once the human has said go, send the merge right after `gh pr create` as one background command, `gh pr checks <n> --watch --interval 20 && gh pr merge <n> --squash --delete-branch --match-head-commit <sha>` with the head you verified: the guard's approval prompt then shows while the human is still there, not minutes later. `&&` keeps a red check from merging, and the head match keeps a later push from landing unapproved. If the watch stops on "no checks reported", send it again. Otherwise present merge / PR / cleanup options, unless the user's own `~/.claude/CLAUDE.md` grants a standing authorization. Docs ship with the change: if setup, commands, env, deploy or integrations changed, run the writing-documentation skill (`/docs`) in the same PR, or state that docs are N/A. After a major milestone, capture lessons as issues via the out-of-scope rule (`/retro`, where installed, proposes them; file only the ones the human picks); lessons about haus-shipped content go upstream as `needs-triage` issues through the issue-authoring skill's routing rule (the haus program and every skill, agent, rule and template it ships to `WeAreHausTech/haus-workflow`), project-local lessons stay in this repo's issues.

**Skills that survey or interview** (an architecture review, a retro, a grilling) only propose: what the human picks enters this loop at Align intent. Start one on a branch (a worktree only from a clean, committed state) if it may edit docs. After a compaction or resume, load the skill you were running again before you continue.

---

## NEVER rules

Apply even in unattended mode. `.claude/settings.json` already denies force pushes, `--no-verify`, `gh pr merge --admin`, publishing and secret-file reads; the rules below are the ones only you can keep.

- **NEVER commit or push without explicit user OK**, unless inside an approved plan (plan approval = blanket exec authority for that plan's scope only) or the user's own `~/.claude/CLAUDE.md` grants a standing authorization that covers it. A standing authorization never covers a merge that deploys production or publishes to a customer.
- Never work directly on `main`. Always a branch or worktree (the Lefthook `branch-guard` stage enforces this where installed).
- Never rewrite published history (amend, rebase then force). Breaks anyone who pulled.
- Never delete a branch with unmerged work without explicit OK.
- Never commit secrets, credentials, tokens or API keys. They are permanent in git history.
- **NEVER encode ambiguity silently.** Ambiguity means stop and ask. Record the resolution in its home: an ADR when it meets the ADR bar, otherwise the spec or plan it changes.

---

## Git

- Squash-merge: `gh pr merge <n> --squash --delete-branch`. Never plain `--merge`, except the release PR below.
- Conventional Commits: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `ci`, `perf`. Scope by domain: `feat(auth):`.
- Closing keywords in a PR body: one keyword per issue, one per line (`Closes #1`, then `Closes #2` on its own line). `Closes #1, #2` closes only #1. They work only when the PR targets the default branch, and another repo's issue needs `owner/repo#123`. Close only what the PR actually finishes.

**Customer projects ship through release branches** (Haus's own repos keep `main` plus tags unless they opt in):

1. Branches are `main`, `release/<n>` (the test environment, no merge gate; numbered on from the highest `release/<n>`, a dated `release/YYYY-MM-DD` with `--date`), `ticket/<id>-<slug>` and `hotfix/<slug>`. `haus release init` writes the rows into `deploy.json` (the human confirms), `haus release start` cuts the release branch.
2. A ticket reaches the release branch with `haus release merge`, which opens the PR and squash-merges it in one step.
3. `haus release ship` opens the release PR into `main`, the one exception to squash: `gh pr merge <n> --merge --match-head-commit <sha>`. It needs a green full-suite status and the human's go.
4. A merge into `main` deploys nothing. Then `haus release tag`, and production is `haus release deploy <tag>`, run only with the human's go.
5. A hotfix goes `hotfix/<slug>` from `main`, `haus release suite` for its green status, PR into `main` (squash) with the human's go, `haus release tag`, `haus release deploy`, then `main` is merged into the open release branch.

---

## Testing rules (non-negotiable)

No task is done until tests pass locally and the changed flow has been run in the app (dev server, local build or docs preview) with data that triggers it. CI green is not verification. All new code ships with tests.

| Layer                         | Minimum bar                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Pure logic / domain functions | TDD. Test first, code second. Cover happy path + edge cases + invariants.                   |
| UI components                 | One render-and-interact test per public component. Query by role/label, not class names.    |
| Backend / data layer          | One integration test per repository function, against a local emulator/test DB, never prod. |
| Critical user flows           | One happy-path E2E per critical journey.                                                    |

**Verification gate:** run the suite for every touched layer and record the passing output in the task's verification block. Untested = unfinished.

**Release branches:** verify the changed flow while building the ticket and record it in the ticket PR; a merge into `release/*` needs no receipt. The full suite runs in the background after each merge and must use parallelism (runner workers, and parallel per-commit reruns to find a breaking ticket). A suite that cannot run in parallel says why (`serialReason`).

**Highest-stakes logic** (financial, auth, medical, pedagogical, and whatever `workflow-config.md` names) is TDD-only: write the test from the spec before any implementation. No exceptions.

**Precedence:** this table is the house testing bar. A rule file installed under `.claude/rules/` (for example `common/testing.md`) adds stack-specific technique on top; where it states a different general bar (a flat coverage percentage, "all test types required", blanket-mandatory TDD), this table wins.

See `workflow-config.md` for this project's test commands.

---

## Pre-commit hooks

Lefthook. `lefthook.yml` holds this project's stages; the house baseline is in two templates haus ships, `packages/templates/lefthook-security.yml` and `packages/templates/lefthook-quality.yml` in the haus-workflow repo, which a project copies and adapts (typecheck, lint, format and secret scan on pre-commit, unit tests on pre-push). A web front end copies `packages/templates/lefthook-lighthouse.yml` as its pre-push stage: Lighthouse CI against the production build, with its limits in `lighthouserc.yml`, so a slower page stops before the PR; a limit changes only in the same PR, with the reason. Never gate E2E in hooks. Write `fail_text` as instructions the agent can act on. Add CI when a second developer joins, a broken commit reaches main, or before the first public release.

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

This table outranks any skill's advice about what `CLAUDE.md`, `AGENTS.md` or a standards file should hold. A project's own path-scoped rules go in `.claude/rules/project/`. A change to haus-shipped content (a skill, agent, rule, template or this standard), proposed by any skill or audit, becomes an upstream issue, never a local edit.

Rule of thumb: ADR for WHY, runbook for HOW TO FIX, memory for what was LEARNED, `CLAUDE.md` for the stable RULES, `workflow-config.md` for the project-specific VALUES.

---

## Subagents

Every spawned agent needs a self-contained prompt: file paths, relevant decisions, expected output format. No implicit context from the parent session. Independent investigations or feature modules run in parallel, each in its own worktree; a state-dependent pipeline runs sequentially; a specific failure gets one agent with full context.

---

## Out-of-scope capture

When you notice out-of-scope work worth keeping (a bug found mid-task, scope deferred from a plan, an idea a human explicitly asks you to record), spawn the `issue-creator` agent instead of a background-task chip. Chips die with the session; issues persist and reach the whole team.

- Findings and deferred scope: file automatically, labelled `needs-triage`. Ideas: only when a human asks; auto-filed ideas bury real bugs.
- Findings about haus-shipped content (a skill, agent, template, or this standard) route upstream through the issue-authoring skill's routing rule: the haus program and every skill, agent, rule and template it ships go to `WeAreHausTech/haus-workflow`. Never put client code or client-identifying detail in an upstream issue.
- No GitHub issues available (no remote, `gh` missing or unauthenticated, issues disabled): create a background-task chip instead and say so in your final message.
- Nothing in a filed issue is implemented before human sign-off.

---

## Stop conditions (unattended mode)

Stop and ask the user when verification fails 3+ times on the same task, a spec/design/UX conflict needs a product decision, a security hole cannot be closed without new requirements, or build or tests are red after rebase.
