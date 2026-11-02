<!-- HAUS-MANAGED id=core.rules-haus v=1 source=@haus-tech/haus-workflow@7.2.0 hash=sha256-01468743065ccc692f86bd1187a15334259dafda1cae63349b591af00c6e97dc -->
- NEVER hand-edit haus-managed blocks (`<!-- HAUS:BEGIN … -->` … `<!-- HAUS:END … -->`)
  or haus-owned files under `.claude/` and `.haus-workflow/` (the package folders `haus sync`
  writes, `rules/haus.md`, `settings.json`, `WORKFLOW.md`). Regenerate via `haus apply` or
  `haus sync`. Hand-edits are silently overwritten or flagged as drift.

## Driving haus
When the user asks to set up, configure, check, fix, refresh, or update the project, run
the matching `haus` command and narrate results in plain language. Never make them use a
terminal or read JSON.
- Set up / configure / fix / check: `haus init`, `haus apply --write`, `haus doctor`
- Update the CLI: `haus update`; pull the packages `haus.json` names: `haus sync`
- `/haus-workflow <task>` does the same conversationally (e.g. `init`, `fix`, `doctor`, `reinit`).
