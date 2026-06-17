---
name: nx21-monorepo-patterns
description: Nx 21 monorepo router. Use for project graph, targets, generators, and workspace orchestration changes.
---

# Nx21 Monorepo Patterns

## Use when

- task changes Nx project config, target pipelines, or workspace package boundaries
- task touches `nx.json`, `project.json`, generator config, or affected app/lib wiring

## Do not use when

- task is feature logic inside one app with no workspace graph impact
- repo is Turbo-only and does not use Nx targets

## Inspect first

- `nx.json` and impacted `project.json` files
- workspace package boundaries and implicit dependency settings
- target scripts tied to build/test/lint tasks

## Avoid mistakes

- creating cyclic project dependencies
- changing target names without pipeline update
- over-broad `affected` scope due incorrect tags/inputs

## Router

1. Load `references/conventions.md` for naming, do/don't, and forbidden patterns.
2. Load `references/scope.md` for workspace graph touchpoints.
3. Load `references/workflow.md` only when debugging affected/target flow.
4. Keep project boundaries explicit and deterministic.

## References

- references/scope.md
- references/workflow.md
