---
name: package-manager-yarn4-pnpm89
description: Package manager router for Yarn 4 and pnpm 8.9 workspaces, constraints, and lockfile behavior.
---

# Package Manager Yarn4 Pnpm89

## Use when

- task changes dependency graph, workspace linking, or lockfile behavior
- task touches `.yarnrc.yml`, `pnpm-workspace.yaml`, root package manager scripts

## Do not use when

- task is feature implementation with no dependency/workspace impact
- repo package manager differs from yarn4/pnpm89

## Inspect first

- root `package.json`, lockfile, and manager-specific config files
- workspace definitions and nohoist/public-hoist rules if present
- scripts invoking manager-specific commands

## Avoid mistakes

- mixing npm install paths in yarn/pnpm managed repos
- manual lockfile edits that break deterministic installs
- dependency version drift across workspace packages

## Router

1. Load `references/conventions.md` for naming, do/don't, and forbidden patterns.
2. Load `references/scope.md` for manager-specific targets.
3. Load `references/workflow.md` only for install/lock/debug flow.
4. Keep lockfile and workspace resolution deterministic.

## References

- references/scope.md
- references/workflow.md
