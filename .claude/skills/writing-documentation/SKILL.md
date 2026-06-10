---
name: writing-documentation
description: >-
  Creates or refreshes AI-oriented project documentation (CLAUDE.md, docs/SUMMARY.md,
  README pointers, setup/workflow/deployment topic files) for app and workspace repos.
  Use when the user runs /docs or asks to init or sync docs from code for agent context.
---

# Writing Documentation

Produces **agent-operable** docs: `CLAUDE.md` and `docs/SUMMARY.md` as primary entry points; file-path references over copied prose. README links humans into topic files. Client-agnostic — use only the current repo’s names, manifest, and code.

## Use when

- The user runs the docs sync (e.g. `/docs`) or asks to initialise or refresh project documentation for agent context.
- After setup, commands, env, dependencies, deploy, or integrations changed and the docs must catch up.
- A repo has no `CLAUDE.md`/`docs/` and needs the initial agent-operable doc set.

## Do not use when

- The task is a code change with no documentation impact.
- You would have to invent facts (URLs, hosts, release steps) not present in code/config — mark those gaps with `> CONFIRM-WITH-TEAM:` instead.
- Editing generated/vendor directories — docs are an index, not a copy of source.

## Integration with haus

This skill ships as a default haus catalog skill. When run inside a haus-managed repo:

- **Seed from the scanner, don't re-derive.** If `.haus-workflow/context-map.json` exists, read it for roles, stacks, dependencies, and package manager and treat those as given. Spend effort on the deep inventory the shallow scanner cannot produce (wired modules, env→consumer mapping, runtime topology, deploy pipeline).
- **Preserve the haus import block.** Never alter or drop the `<!-- HAUS:BEGIN haus-imports v=1 -->` … `<!-- HAUS:END haus-imports -->` block in `CLAUDE.md`; write your body around it.
- **Emit enrichment for asset selection.** After the deep scan, if `.haus-workflow/` exists, write `.haus-workflow/deep-context.json` (best-effort) so haus can recommend skills the shallow scan missed:

  ```json
  { "source": "writing-documentation", "roles": [], "stacks": {}, "patterns": [] }
  ```

  Then hint the user: run `haus recommend && haus apply` to pick up newly-discovered skills.

- **App mode only under haus.** haus drives single-repo (app mode). Workspace mode is for manual multi-repo use; haus does not orchestrate it.

## Workflow

Copy and track:

```text
Docs Progress
- [ ] 1. Context scan
- [ ] 2. Detect mode (app | workspace)
- [ ] 3. Write/update outputs (templates in references/)
- [ ] 4. Run references/validation-checklist.md + completeness-criteria.md
```

### 1. Context scan

Read existing docs, then discover facts from code/config only (no invented URLs, architecture, or release steps).

**Always scan**

1. `CLAUDE.md`, `docs/SUMMARY.md`, existing `docs/`
2. `README.md`, key config (`package.json`, `composer.json`, CI workflows, `docker-compose.yml`, etc.)
3. `.env.example` or `.env.sample`
4. `git log --oneline -20` when updating
5. Test/lint/build scripts and pre-commit hooks (note explicitly if absent)

**App mode — discover and document**

| Discover                                                                              | Document in                                   |
| ------------------------------------------------------------------------------------- | --------------------------------------------- |
| Bootstrap entry points (`index`, `main`, server, worker, CLI)                         | `architecture.md`, `codebase.md`              |
| Central wiring/config file(s)                                                         | `codebase.md`, `CLAUDE.md` conventions        |
| **Every** top-level module/plugin/package area **and** packages wired only via config | `codebase.md` inventory                       |
| Generated dirs (`gql/`, `generated`, etc.) + regen scripts                            | `development-workflow.md` or `conventions.md` |
| Migration/schema tooling                                                              | `CLAUDE.md`, workflow, architecture           |
| Runtime processes (API + worker + scheduler, etc.)                                    | `architecture.md`                             |
| External integrations (CMS, search, queue, email) + env vars                          | `setup.md`, `architecture.md`                 |
| Env vars → consumer (grep config for each key from `.env.example`)                    | `setup.md` env table                          |
| CI deploy pipeline (triggers, build, migrate, verify)                                 | `deployment.md`                               |

**Inventory rule:** If it is registered or imported in central config, it must appear in the codebase map (name, path, one-line purpose). No “major plugins only” sampling.

**Workspace mode — discover**

1. `repos.manifest.json`, `repos.local.json.example`, path overrides
2. Per-repo pointers only — do not copy app install/deploy tables
3. Cross-repo startup order, env alignment, release order (or CONFIRM-WITH-TEAM)

### 2. Detect mode

| Mode          | Signal                                                           |
| ------------- | ---------------------------------------------------------------- |
| **App**       | Application source in this repo                                  |
| **Workspace** | Multi-repo orchestration (`repos.manifest.json`, path overrides) |

State the mode. Ask if unclear.

### 3. Write outputs

**Both modes (always):** `CLAUDE.md`, `README.md`, `docs/SUMMARY.md`

**App mode — add when justified** (formats and triggers in `references/topic-file-formats.md`):

| File                           | Typical trigger                                           |
| ------------------------------ | --------------------------------------------------------- |
| `docs/setup.md`                | Non-trivial local setup or env                            |
| `docs/development-workflow.md` | Non-obvious change paths or quality checks                |
| `docs/deployment.md`           | CI/CD or remote deploy                                    |
| `docs/architecture.md`         | DB, queue, search, external APIs, or multi-process        |
| `docs/codebase.md`             | Application source tree exists                            |
| `docs/conventions.md`          | Extensions, plugins, custom metadata, workers, or codegen |

**Optional app topics** (only when triggered — see `topic-file-formats.md`):

`integrations.md`, `testing.md`, `data-model.md`, `security.md`

**Workspace mode — glue only** (no per-repo install/deploy copies):

`docs/system-overview.md`, `docs/repositories.md`, `docs/local-development.md`, `docs/environments.md`, `docs/release-flow.md`

| Owns detail | Content                                                        |
| ----------- | -------------------------------------------------------------- |
| App repo    | Setup, commands, env, architecture, deploy, pre-PR             |
| Workspace   | Repo map, integration, cross-repo env alignment, release order |

Missing app-repo docs → create in **app repo**, not by expanding workspace docs. Workspace points with `{folder}/path` to config or app docs.

**Init:** no `CLAUDE.md` or `docs/` — create full set for mode.  
**Update:** surgical edits; preserve good content; align to current code.

### 4. Validate

Run every item in:

- `references/validation-checklist.md`
- `references/completeness-criteria.md`

## References (read per output)

| File                                      | Use for                         |
| ----------------------------------------- | ------------------------------- |
| `references/claude-template.md`           | `CLAUDE.md` (app mode)          |
| `references/claude-template-workspace.md` | `CLAUDE.md` (workspace mode)    |
| `references/summary-template.md`          | `docs/SUMMARY.md`               |
| `references/topic-file-formats.md`        | All topic files + optional docs |
| `references/completeness-criteria.md`     | Definition of done              |
| `references/validation-checklist.md`      | Final pass                      |

Read the matching reference before writing that output. Do not invent structures the project does not already use.

When writing `CLAUDE.md`, use the app or workspace template and include a **keep docs in sync** convention plus PR checklist rows. App repos: update topic docs in-repo. Workspace: update glue docs only; implementation changes stay in app repos.

## Rules

- One home per fact; link elsewhere.
- `{folder}` = manifest folder name or actual repo directory.
- `> CONFIRM-WITH-TEAM: confirm with team.` for gaps.
- Concise updates over full rewrites.
- Ask only when inference fails.
- Docs are for **routing and decisions**; implementation detail stays in source.
