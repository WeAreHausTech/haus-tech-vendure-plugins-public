---
name: nx-tag-conventions
description: Haus-specific Nx project tag, module-boundary, and generator-placement conventions. Use alongside the official nx-workspace/nx-generate skills, not instead of them.
---

# Nx Tag Conventions

This supplements `haus.nx-nx-workspace` and `haus.nx-nx-generate` (official, generic Nx
guidance) with conventions specific to Haus-managed workspaces that those skills don't cover.

## Use when

- naming or applying `tags` on a new or existing Nx project
- adding a custom generator or executor
- enforcing or reviewing `enforce-module-boundaries` lint rules

## Conventions

- Library tags: `scope:<feature>` for domain ownership, `type:ui` / `type:data` / `type:util` /
  `type:feature` for layer — apply both dimensions to every project.
- Generated executors live at `tools/executors/<executor-name>/executor.ts`.
- Generated generators live at `tools/generators/<generator-name>/generator.ts`.
- Enforce tag constraints via `nx.json`'s `enforce-module-boundaries` rule — never commit a
  change that removes an existing boundary constraint without an explicit decision to widen it.
- Prefer local workspace generators over external plugin generators when both could satisfy a
  request (matches `haus.nx-nx-generate`'s guidance, called out here because it's easy to miss
  once local generators exist in `tools/generators/`).

## Do not use when

- exploring workspace structure or running generators — use the official
  `haus.nx-nx-workspace` / `haus.nx-nx-generate` skills for that.
