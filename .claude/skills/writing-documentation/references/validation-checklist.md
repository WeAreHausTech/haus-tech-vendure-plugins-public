# Validation checklist

Run this before finishing a docs update. Also run `completeness-criteria.md`.

## Required checks

- Path from setup → develop → verify → deploy is documented or explicitly CONFIRM-WITH-TEAM.
- `CLAUDE.md` includes setup, commands, conventions, PR checklist, and guidance to update docs when setup/commands/env/deploy/integration changes.
- `docs/SUMMARY.md` matches files on disk (no phantom links).
- README links to `docs/SUMMARY.md` and relevant setup/workflow docs.
- No invented requirements, URLs, hosts, or release steps.
- `.env.example` or `.env.sample` is referenced when environment is discussed.
- All items in `completeness-criteria.md` for the detected mode are satisfied or CONFIRM-WITH-TEAM.

## App-mode checks

- Codebase map lists **all** top-level source areas and wired modules found in central config (not a partial sample).
- Env table includes **Used by** (consumer/subsystem or config path) or explicit CONFIRM-WITH-TEAM to add.
- Generated-code directories are named with regen command, or marked N/A.
- Multi-process runtime is documented in architecture, or explicitly single-process / N/A.
- External/wired packages are distinguished from in-repo modules.
- Agent Context Guide in SUMMARY includes task → doc routing.

## Workspace-mode checks

- Manifest/repo map is complete with pointers to each app’s docs.
- Startup order and cross-repo env/release are documented or CONFIRM-WITH-TEAM.
- Workspace docs do not duplicate app install/deploy/env tables.

## Single-source checks

- App repo docs own implementation detail; workspace docs point to app file paths.
- Workspace docs do not duplicate app repo setup/deploy internals.
- References in workspace docs use real repo folder names or manifest folder names.
- Commands and conventions are not duplicated at length in both `CLAUDE.md` and topic files (one primary home, link elsewhere).

## Quality checks

- Unknowns are marked with `> CONFIRM-WITH-TEAM: confirm with team.`
- Terminology is consistent across docs.
- Changes are concise and aligned with current code/config.
- Docs prefer path references over copying implementation detail.
