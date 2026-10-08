- NEVER hand-edit haus-managed blocks (`<!-- HAUS:BEGIN … -->` … `<!-- HAUS:END … -->`)
  or haus-owned files under `.claude/` and `.haus-workflow/` (lock-tracked catalog items,
  `rules/haus.md`, `settings.json`, `WORKFLOW.md`). Regenerate via `haus apply`.
  Hand-edits are silently overwritten or flagged as drift.

## Driving haus
When the user asks to set up, configure, check, fix, refresh, or update the project, run
the matching `haus` command and narrate results in plain language. Never make them use a
terminal or read JSON.
- Set up / configure / fix / check: `haus init`, `haus apply --write`, `haus doctor`
- Update package + catalog: `haus update`
- `/haus-workflow <task>` does the same conversationally (e.g. `init`, `fix`, `doctor`, `reinit`).
