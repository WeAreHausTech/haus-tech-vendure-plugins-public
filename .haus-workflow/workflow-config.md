# How this project works (workflow methodology bindings)

> The few project-specific values the workflow standard (WORKFLOW.md) binds to:
> where the source-of-truth docs live, the test commands the TDD/verification gate
> runs, the highest-stakes logic, and the pre-commit tool. This file is yours to
> edit and haus will not overwrite it.
>
> Everyday commands (dev, build, lint, typecheck, format) and project documentation
> live in `CLAUDE.md` + `docs/` — run **`/docs`** to generate/refresh them.

## Source-of-truth documents
- Spec: <!-- fill in path, e.g. docs/SPEC.md -->
- Design: <!-- fill in path, e.g. docs/DESIGN.md -->
- UX flows: <!-- fill in path, e.g. docs/UX.md -->

## Test commands (TDD / verification gate)
- Test (unit + integration): `yarn run test`
- Test (E2E): <!-- fill in command, e.g. playwright test -->

## Highest-stakes logic
<!-- fill in domain areas requiring TDD-only treatment, e.g. payment flows, auth, medical data -->

## Pre-commit tool
- Tool: <!-- fill in e.g. lefthook, husky -->
