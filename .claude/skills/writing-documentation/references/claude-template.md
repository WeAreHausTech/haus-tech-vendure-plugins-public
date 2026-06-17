# CLAUDE.md template — app mode

Single-codebase repos. **Workspace:** use `claude-template-workspace.md`. Keep concise (~150 lines or less).

```markdown
# [Project name]

[1-2 sentences on repo purpose and role.]

## Setup

[Brief prerequisites/install/env. Link to docs/setup.md when it exists.]

## Commands

| Command   | Action           |
| --------- | ---------------- |
| `[dev]`   | ...              |
| `[build]` | ...              |
| `[test]`  | ...              |
| `[check]` | Lint / typecheck |

Omit rows that do not exist in package.json (or equivalent).

## Key conventions

- [3-8 project-specific bullets from code scan: wiring file, runtime split, schema tool, etc.]
- **Docs are an index:** use path references in `docs/`; read source for implementation detail.
- **Regenerate, don't patch:** after schema/API changes, run documented codegen/migration commands — do not hand-edit generated dirs.
- **Keep docs in sync:** after setup, commands, env, deploy, or integration changes, run the **writing-documentation** skill in **this repo** and commit doc updates with the code change.

## Before opening a PR

- [ ] Run available checks (test/lint/build)
- [ ] Run the **writing-documentation** skill in this repo when setup, commands, env, deploy, or integration changed (or N/A)
- [ ] Docs reflect this change or explicitly N/A
- [ ] Run repo-specific steps (migrations, codegen, i18n, etc.) when applicable
- [ ] Smoke-test impacted flows if no automated coverage

## Docs

[docs/SUMMARY.md](docs/SUMMARY.md)
```
