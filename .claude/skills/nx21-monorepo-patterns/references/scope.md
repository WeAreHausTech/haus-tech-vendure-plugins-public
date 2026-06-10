# Scope

## In-scope files and dirs

- `nx.json` — workspace-level defaults, task runners, named inputs, cacheable ops
- `project.json` (per project) — targets, executors, options, tags
- `apps/**/project.json`, `libs/**/project.json` — per-project target config
- `.nxignore` — files excluded from project graph hashing
- `tools/generators/**` — custom Nx workspace generators
- `tools/executors/**` — custom Nx executors
- `workspace.json` (legacy) — superseded by per-project `project.json`
- `tsconfig.base.json` — path aliases that define library boundaries

## Stack boundaries

- Nx 21 targets: `build`, `test`, `lint`, `serve`, `e2e` and custom named targets
- Project graph: implicit/explicit dependencies, `tags`, `namedInputs`
- Affected commands: `nx affected` using project graph and changed files
- Not in scope: app feature logic inside one project with no graph change
- Not in scope: Turbo pipeline config (use turbo-monorepo-patterns)

## Triggers

- Adding or removing apps or libs (`nx generate @nx/...`)
- Changing target names or executor options in `project.json`
- Adding `dependsOn` between targets
- Modifying `namedInputs` or `targetDefaults` in `nx.json`
- Adding or changing project `tags` (used for lint rules, affected filtering)
- Updating `tsconfig.base.json` path aliases for library imports
- Adding a custom generator or executor in `tools/`
