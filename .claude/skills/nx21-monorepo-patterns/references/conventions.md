## Naming conventions

- Library tags: `scope:<feature>` for domain ownership, `type:ui` / `type:data` / `type:util` / `type:feature` for layer
- Target names in `project.json`: match `package.json` script keys exactly (case-sensitive)
- Generated executors: `tools/executors/<executor-name>/executor.ts`
- Generated generators: `tools/generators/<generator-name>/generator.ts`
- Nx workspace library name: `<scope>-<name>` kebab-case matching the directory path

## Do / don't

DO: Run `nx graph` before adding or changing target dependencies — DON'T: guess the dependency graph; verify it visually
DO: Create new libraries via `nx generate` — DON'T: create library folders manually (skips `project.json`, tags, and `tsconfig.base.json` path registration)
DO: Add `dependsOn: ["^build"]` to tasks that need upstream build output — DON'T: run `build` tasks without ensuring dependencies build first
DO: Use `nx affected` or `--filter` in CI — DON'T: run `nx run-many --all` on large monorepos in CI (runs everything)
DO: Define `namedInputs` to scope cache invalidation precisely — DON'T: use catch-all `namedInputs` that invalidate unrelated projects on every change
DO: Enforce tag constraints in `nx.json` `enforce-module-boundaries` rule — DON'T: allow cross-scope imports that bypass the boundary rules
DO: Keep `outputs` arrays in `project.json` covering all generated artifacts — DON'T: omit output paths (breaks remote cache correctness)

## Forbidden patterns

NEVER: Manually edit `project.json` target to duplicate an executor without a documented reason — causes maintenance drift
NEVER: Library without `tags` in `project.json` — module boundary rules cannot be enforced
NEVER: Cyclic dependency between scope tags (scope A → scope B → scope A) — breaks affected computation and deployability
NEVER: Implicit dependency without declaring it in `implicitDependencies` — invisible to the task graph
NEVER: Commit changes to `nx.json` module boundary rules that remove existing constraints — silently widens blast radius
NEVER: `nx migrate` run without reviewing the generated migration script before applying — may auto-modify source files unexpectedly
