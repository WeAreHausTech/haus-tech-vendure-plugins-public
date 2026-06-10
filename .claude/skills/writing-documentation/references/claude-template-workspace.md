# CLAUDE.md template — workspace mode

Multi-repo orchestration repos (`repos.manifest.json`, path overrides). **No application source here** — setup, commands, and deploy detail live in app repos. **App repos:** use `claude-template.md`. Keep concise (~150 lines or less).

```markdown
# [Workspace name]

Meta-repo for **multi-repo context**: manifest, integration boundaries, cross-repo env alignment, coordinated release order. **No application source here** — setup, commands, and deploy detail live in app repos (`repos.manifest.json` folders).

## Setup

1. `repos.local.json.example` → `repos.local.json` if app repos are outside this tree (`pathOverrides` keys = manifest `folder` names).
2. Or clone per `repos.manifest.json` into workspace root (gitignored).
3. [docs/local-development.md](docs/local-development.md) — layout and startup order only.
4. Per app repo: [docs/repositories.md](docs/repositories.md) → `{folder}/README.md`, `.env.example`, config (see index table).

## Commands

No runtime in this repo. Commands live in each app’s `package.json` / `composer.json` (or equivalent).

## Key conventions

- **Agent entry:** `CLAUDE.md` + [docs/SUMMARY.md](docs/SUMMARY.md); load topic files from SUMMARY tables as needed.
- **Single source of truth:** facts in one repo; workspace docs use `{folder}/path` pointers, not copies of app setup/deploy.
- Do not commit `repos.local.json`.
- Cross-repo env alignment: [docs/environments.md](docs/environments.md).
- **Keep docs in sync (all manifest repos):** after code changes, run the **writing-documentation** skill in every affected repo (this workspace + app repos). App implementation → that repo’s docs; manifest/integration → this workspace. Regenerate `docs/SUMMARY.md` when doc files change in that repo.

## Before opening a PR (workspace)

- [ ] `docs/SUMMARY.md` matches files on disk.
- [ ] Workspace docs reflect this PR (manifest, integration, cross-repo process) or N/A.
- [ ] No duplicated install/deploy tables from app repos.
- [ ] New operational detail added in the **app repo** first; pointer here only if cross-cutting
- [ ] Ran the **writing-documentation** skill in this workspace and in each affected app repo (or N/A)

App-repo PR checks: each repo’s `CLAUDE.md` when present.

## Docs

[docs/SUMMARY.md](docs/SUMMARY.md)
```

## Workspace glue docs (create when justified)

Point to these from `docs/SUMMARY.md`; do not copy app-repo install/deploy prose.

| File                        | Owns                                             |
| --------------------------- | ------------------------------------------------ |
| `docs/system-overview.md`   | Integration boundaries, data flow between repos  |
| `docs/repositories.md`      | Repo map, links to each app’s README and config  |
| `docs/local-development.md` | Layout, clone/path overrides, startup order only |
| `docs/environments.md`      | Cross-repo env alignment                         |
| `docs/release-flow.md`      | Coordinated release order across manifest repos  |

Missing app-repo detail → create or update in **that app repo**, not by expanding workspace docs.

## Workspace completeness

Before finishing, verify `references/completeness-criteria.md` workspace section: repo map complete, startup/release/env documented or CONFIRM-WITH-TEAM, no duplicated app tables.
