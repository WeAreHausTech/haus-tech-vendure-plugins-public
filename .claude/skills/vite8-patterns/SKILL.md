---
name: vite8-patterns
description: Vite 8 router. Use for build/dev-server config, plugin wiring, and frontend runtime bundling behavior.
---

# Vite8 Patterns

## Use when

- task changes Vite config, plugin setup, alias resolution, or build output behavior
- task touches `vite.config.*`, env handling, or dev/build script integration

## Do not use when

- task is framework component logic with no Vite build impact
- task is backend-only service/API work

## Inspect first

- `vite.config.*`, plugin setup, and resolve/alias config
- env mode handling (`.env*`) and import usage
- package scripts and build output assumptions

## Avoid mistakes

- mode/env drift between local and CI build paths
- plugin order issues that break transforms
- alias mismatch between tsconfig and Vite resolve config

## Router

1. Load `references/conventions.md` for naming, do/don't, and forbidden patterns.
2. Load `references/scope.md` for config/build touchpoints.
3. Load `references/workflow.md` only for build pipeline debugging.
4. Keep config minimal and deterministic across environments.

## References

- references/scope.md
- references/workflow.md
