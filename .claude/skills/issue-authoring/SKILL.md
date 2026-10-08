---
name: issue-authoring
description: >-
  Use when filing bugs or review findings, capturing scope deferred out of a plan, or
  recording ideas as GitHub issues in the two-audience house format — a short human section
  for approval first, then a technical section deep enough to implement from. Filing
  bugs/review findings, capturing scope deferred out of a plan, recording ideas that arise
  during development. Work already approved and planned — that belongs in the plan.
---

# Issue Authoring

Every issue has two audiences in one body: a human section readable in under a
minute (no file paths, no jargon, no code) that a decision-maker can say yes or
no to, then a technical section, arbitrarily deep, for whoever picks it up after
approval.

**Every issue is a proposal, not a work order. Nothing filed may be implemented
before a human signs off.**

## Automation asymmetry

- `finding` / `deferred`: may be filed automatically — bounded by real work.
  Label everything auto-filed `needs-triage`.
- `idea`: file ONLY on explicit human request. Idea volume is unbounded —
  auto-filed ideas bury real bugs within weeks.

## Routing: which repo gets the issue

Decide the destination per item BEFORE anything else — availability, labels,
dedupe, and create all run against it.

- **Project-local** (default): the finding concerns this repository's own
  code, config, or process. File into the current repo, unchanged.
- **Catalog-content**: the finding concerns content haus shipped — a skill,
  agent, rule, template, or the workflow standard itself (files haus
  installed under `.claude/skills/`, `.claude/agents/`, `.claude/templates/`,
  the catalog rule folders under `.claude/rules/`, or
  `.haus-workflow/WORKFLOW.md`). A local issue about shipped content is
  invisible upstream and the defect ships to every other consumer, so file it
  where it is fixed once for everyone:
  `gh issue create -R WeAreHausTech/haus-workflow-catalog …`. Already in that
  repo, routing is a no-op — file locally.
- **Haus CLI**: the finding concerns the haus program rather than catalog
  content it installs: a command's behaviour, output or exit code, a wrong or
  missing finding from doctor, the decision gate or the CI gate, a guard hook,
  a file the CLI writes and owns (`.claude/settings.json`,
  `.claude/rules/haus.md`, the managed blocks in `CLAUDE.md`,
  `.haus-workflow/haus.lock.json`), or a skill or agent the CLI ships itself
  (in `~/.claude/skills/` or `~/.claude/agents/` by default, with
  `source=@haus-tech/haus-workflow@<version>` in its `haus_managed`
  frontmatter). File it where the CLI is fixed:
  `gh issue create -R WeAreHausTech/haus-workflow …`. Already in that repo,
  routing is a no-op: file locally. When it is unclear whether the CLI or the
  catalog owns a finding, route it to the catalog.

Catalog- and CLI-routed issues cross a repo boundary. NEVER include client code,
secrets, internal URLs, or client-identifying paths: name the shipped item and
its path as shipped in the catalog (for a Haus CLI finding, the command, skill
or agent and the haus version), describe the defect against the shipped
content, and call the discovering project only "a consumer repo".

If upstream filing is unavailable (no access, unauthenticated, issues
disabled), do not drop the finding: file it project-local with one extra
header line, and say so in your report —
`> **Routing:** catalog-content — upstream filing failed (<reason>); re-file to WeAreHausTech/haus-workflow-catalog`
For a Haus CLI finding the line reads `> **Routing:** haus-cli, upstream filing failed (<reason>); re-file to WeAreHausTech/haus-workflow`.

A retro candidate is a finding like any other: route it by what it is about.
File one issue per candidate the human picks, and none for the rest.

## Common header (every issue)

```markdown
> **Type:** finding | deferred | idea · **Severity/Size:** <value> · **Source:** <where + date>
> **Status:** Awaiting human approval — do not implement before sign-off.
> **Failing test exists:** Yes — `<path>` / No / n/a
```

Keep the header even with native fields set — the approval gate and failing-test
flag have no native equivalent.

### Recording approval

**Read `references/recording-approval.md` before touching a `Status` line** — it holds
the named-evidence bar (without that evidence you edit nothing and start nothing), the
exact approved-status format, and the read-modify-write recipe that keeps `gh issue edit`
from wiping the technical section.

## Templates

### finding — a bug or review finding

Sections, in order: `Summary` · `Consequences` · `What's affected` · `Risks` ·
`Is it visible in the application?` · `---` · `Technical description`
containing `Reproduction`, `Root cause`, `Suggested fix`, `Verification`,
`Related`.

Rules:

- Never claim a reproduction that was not performed — write "code-read, not
  reproduced" explicitly.
- When a pattern repeats, note every occurrence.
- Record environment traps (e.g. reproduces only in a bundled build, not via
  raw imports — omitting that sends a fixer down the wrong path).
- If the finding implies an architecture decision, draft or reference an ADR
  via the `adr-decisions` skill and link it under `Related`.

### deferred — scope pushed out of a plan

Sections: `What was deferred` · `Why it was deferred` (the decision and who
made it) · `What we are doing instead` · `What would make this worth doing`
(the trigger — the critical field: it lets the item be re-evaluated
later) · `Rough size` · `---` · `Technical notes` ·
`Related plan/ADR`.

No root cause or reproduction — there is no defect.

### idea — the lightest template

Sections: `What` (one sentence) · `Why / what problem it solves` ·
`Rough size` (a guess is fine) · `What would make this worth doing` ·
`Context when the idea came up` (where in the code, what task was in
progress — what makes the idea recoverable six months later).

## Operating rules

- Titles in plain language a non-developer understands — no jargon, finding IDs,
  or file paths.
- One issue per item; merge only on explicit request.
- Never invent detail. Unverified reproductions or root causes must be
  labelled as such. An issue with honest gaps beats a confident guess.
- `has-failing-test` label wherever a red test exists.
- Dedupe search scope: open and closed issues, titles and bodies, in English
  and Swedish (`gh issue list --search`, `gh search issues`).
- **Keep dedupe queries to 2–3 distinctive words, and run several narrow ones
  rather than one long one.** GitHub free-text terms are ANDed within a single
  indexed field, so a query mixing title-only and body-only words matches
  nothing and silently reports "no duplicate". Verified: an issue whose title
  matched `placeholder bug report` and whose body matched `skill verification`
  was returned by each query alone and by neither combined. A long query is the
  failure mode that manufactures duplicates.
- Run both engines: `gh issue list --search` and `gh search issues` disagree on
  the same query; treat a hit from either as a duplicate.

## Procedure

1. Route each item (Routing section above), then confirm GitHub issues are
   available on its destination:
   `gh repo view [<owner>/<repo>] --json nameWithOwner,hasIssuesEnabled`.
   If this fails for the local repo (no GitHub remote, `gh` missing or
   unauthenticated) or reports `hasIssuesEnabled: false`, abort immediately —
   file nothing — and tell whoever invoked you to create a background-task
   chip instead. If it fails only for the upstream repo, fall back to
   project-local filing with the routing marker line instead of aborting.
2. **Read `references/native-metadata.md` before running the detection query** — it
   holds the detection query itself, the union inline-fragment gotcha, the truncation
   and permission cases, the native-vs-fallback table, and the mutations. Do not
   improvise the query from memory — the issue-fields schema is still rolling out,
   and a guessed field name errors in a way that reads as "this repo has no issue
   fields". Run the detection query; pick native or fallback per row of that table.
   Confirm every label you intend to pass exists on the destination repo
   (`gh label list [-R <owner>/<repo>]`) — a missing
   label makes `gh issue create` fail outright. Do NOT create the missing ones:
   labels are shared repo taxonomy, creating them unattended is exactly the kind
   of unapproved change this skill exists to avoid. Drop the missing ones, keep
   the rest, and list every label you skipped so a human can add them
   deliberately. If `needs-triage` itself is missing, still file — then say so
   prominently, because the issue is now untriaged with nothing marking it.
3. Draft the body to a temp file using the matching template. **YOU MUST write
   EVERY issue body through a QUOTED heredoc — `cat > "$f" <<'EOF'` — never
   unquoted:** this draft, the approval-record edit, the step-7 cross-reference
   pass, any body write at all. Unquoted, it expands `$VAR`, `${...}`,
   `` ` ` `` and `$(...)` inside the code snippets the technical section quotes,
   silently corrupting the issue and potentially executing repo-derived commands.
4. Dedupe search — IMMEDIATELY before `gh issue create`, not at batch start
   (a batch-start check goes stale and produces duplicates, as it did in
   the pilot). Search the destination repo: `gh issue list -R <owner>/<repo> --search`,
   `gh search issues --repo <owner>/<repo>`.
5. `gh issue create [-R <owner>/<repo>] --title '<plain title>' --body-file <tmp> --label needs-triage [--label …]`
6. Query the created issue's `viewerCanType`/`viewerCanSetFields`/`viewerCanLabel`;
   set native type/priority/effort only where the flag allows, then read the
   state back — the ack does not prove the value landed. The capability query, the
   three mutations (`updateIssueIssueType`, `setIssueFieldValue`, `addSubIssue`) and
   the read-back query are all in `references/native-metadata.md` — read it before
   mutating.
7. After the whole batch: relationships pass (`addSubIssue`, `#n` cross-ref
   edits via `gh issue edit`) — issue numbers do not exist until creation,
   so this pass must wait.
8. Report a table: issue URL · type · priority · effort · labels · relations —
   plus, honestly, every fallback used and why (absent setup, truncation, or a
   `viewerCan*` flag), every label skipped, and every duplicate found.
