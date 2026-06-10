# SUMMARY.md template

Use when creating or regenerating `docs/SUMMARY.md`. Remove sections with zero files on disk.

```markdown
# [Project Name]

[One paragraph: what this repo is, its role in the wider system if applicable, core capability. Factual only.]

## Agent Context Guide

- Use this file as the documentation index; open detail docs from the tables below only when needed.
- Start with **CLAUDE.md** for setup, commands, conventions, and pre-PR checks.
- Route by task (load one primary topic, not every file):
  - **Run / debug locally** → Setup (app: `setup.md`; workspace: `local-development.md`)
  - **Code change** → Codebase; add Conventions and Architecture if the change is cross-cutting or touches integrations
  - **Ship / release** → Development workflow + Deployment (app) or Release flow (workspace)
  - **Multi-repo** (workspace only) → Repositories + Environments + System overview as needed
- Prefer path references in docs over duplicating source; read code for implementation detail.
- If docs conflict with code or user intent, ask before making broad changes.

## Architecture

| File                               | Description |
| ---------------------------------- | ----------- |
| [architecture.md](architecture.md) | …           |

## Codebase

| File                       | Description |
| -------------------------- | ----------- |
| [codebase.md](codebase.md) | …           |

## Conventions

Omit if `docs/conventions.md` does not exist.

| File                             | Description                                        |
| -------------------------------- | -------------------------------------------------- |
| [conventions.md](conventions.md) | Extension patterns, schema/codegen, change recipes |

## Setup

| File                 | Description |
| -------------------- | ----------- |
| [setup.md](setup.md) | …           |

## Development workflow

Omit if `docs/development-workflow.md` does not exist.

| File                                               | Description                                   |
| -------------------------------------------------- | --------------------------------------------- |
| [development-workflow.md](development-workflow.md) | Common changes, where to edit, quality checks |

## Deployment

Omit if no deployment docs exist.

| File                           | Description |
| ------------------------------ | ----------- |
| [deployment.md](deployment.md) | …           |

## Other

Optional. Non-standard docs only (integrations, testing, data-model, security, etc.).

| File               | Description |
| ------------------ | ----------- |
| [path.md](path.md) | …           |
```

## Regeneration rules

- List every file that exists on disk; no phantom rows.
- Omit empty sections.
- Links relative to `docs/`.
- One-line descriptions in tables; detail in linked files.
- **Workspace repos:** SUMMARY describes glue docs only; link app-repo paths from `repositories.md`, do not duplicate app `setup.md` / `deployment.md` content here.
