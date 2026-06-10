# Topic file formats

Use this file for detailed formatting guidance. Keep SKILL.md high-level.

## Inventory rule (app mode)

When scanning central config/wiring, **every registered module, plugin, package, or top-level source area** must appear in `docs/codebase.md` (at least name, path, one-line purpose). Do not document only a “major” subset.

## `docs/setup.md`

**Create when:** multiple services, external dependencies, non-obvious env vars, or troubleshooting needs.

**Required sections:**

- Prerequisites
- Related systems (what must run locally: DB, queue, search, etc.)
- Install
- Environment — table from `.env.example` with columns: **Variable | Purpose | Used by** (subsystem name or config file path; grep config if needed)
- Run locally
- Verify — concrete checks (URLs, health endpoints, log lines) from README/scripts, or CONFIRM-WITH-TEAM
- Troubleshooting

## `docs/development-workflow.md`

**Create when:** split runtime, missing test script, hooks, i18n, external CMS/API, or non-obvious change paths.

**Required sections:**

- Scope of this repo
- Common changes
- Where to change what (table: change type → primary path(s))
- Quality checks (test/lint/build commands; note if lint/hooks absent)
- Link to deployment docs when they exist

**Include when discovered:**

- Generated artifact dirs and regen commands (`codegen`, OpenAPI, etc.)
- Schema/migration workflow order
- If multiple extension patterns exist (e.g. central registry vs module config), point to `docs/conventions.md` or document briefly here

## `docs/deployment.md`

**Create when:** CI/CD, multiple environments, remote deploy, or post-deploy tasks.

**Required sections:**

- Hosting/runtime overview
- Deploy triggers (branch, tag, manual dispatch — from workflows)
- Environment differences
- Release checklist (numbered, from CI/scripts)
- Artifacts — what is built and where it lands (if inferable)
- Post-deploy verification — smoke checks from workflows/scripts, or CONFIRM-WITH-TEAM
- Rollback notes — only if inferable from workflows/docs; else CONFIRM-WITH-TEAM

## `docs/architecture.md`

**Create when:** app has two or more of: database, queue/cache, search index, external APIs, multiple processes.

**Required sections:**

- Runtime model — processes and roles
- Core components — names from config (DB, cache, queue, search, etc.)
- Extension model — how domain logic is organized (plugins, modules, packages) and registration location
- Request/job flow — short numbered flow (e.g. API → logic → async job)
- Integration boundaries — external systems and env vars that configure them (not full API specs)
- Schema evolution — migrations/versioning if present, or N/A

## `docs/codebase.md`

**Create when:** application source exists (`src/`, `app/`, `lib/`, etc.).

**Required sections:**

- Top-level directories (table: path → purpose)
- Entry points and wiring — bootstrap files + central config path(s)
- **Complete inventory** — all top-level modules/plugins/packages under main source root and wired external packages (from central config)
- Where to change what (table: task → path(s))
- Tests — where unit/e2e/integration tests live, or N/A

## `docs/conventions.md`

**Create when:** framework extensions, plugins/modules, custom metadata/fields, workers, or codegen — and patterns are not obvious from layout alone.

**Suggested sections:**

- Extension patterns — how the app extends the framework; where registration happens (paths only)
- Configuration vs code — env vs config files vs database
- Schema/data changes — tool and order of operations
- Generated artifacts — paths and regen commands; do not hand-edit
- Common change recipes (table filled from scan):

  | Task | Start here | Also touch |
  | ---- | ---------- | ---------- |

- Multiple ways to add the same kind of metadata (e.g. central file vs module config): document both and when to use each, if the repo has both

## Optional topic files

Create only when triggered; link from `docs/SUMMARY.md` **Other** section.

| File                   | Trigger                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `docs/integrations.md` | Three or more external systems, or non-obvious sync/webhooks              |
| `docs/testing.md`      | Multiple test types, custom fixtures, or heavy e2e setup                  |
| `docs/data-model.md`   | Frequent schema/migration pain; complex custom persistence                |
| `docs/security.md`     | Non-obvious auth boundaries or PII handling (high-level only; no secrets) |

## Workspace glue docs

See `claude-template-workspace.md`. Do not copy app-repo install/deploy tables.

| File                        | Owns                                             |
| --------------------------- | ------------------------------------------------ |
| `docs/system-overview.md`   | Integration boundaries, data flow between repos  |
| `docs/repositories.md`      | Repo map, links to each app README and config    |
| `docs/local-development.md` | Layout, clone/path overrides, startup order only |
| `docs/environments.md`      | Cross-repo env alignment                         |
| `docs/release-flow.md`      | Coordinated release order across manifest repos  |

## Topic file rules

- Use content-based names (e.g. `api-design.md`, not `overview.md`).
- Prefer flat files unless there are two or more distinct documents in that area.
- Avoid copied content from other docs; reference source paths.
- One home per fact; link elsewhere.
