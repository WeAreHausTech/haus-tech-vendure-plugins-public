# Workflow

## Implementation steps

1. Check project graph before changes: `nx graph` — identify upstream/downstream dependencies
2. For new library: use generator to scaffold — do not create manually
3. For target changes: update `project.json` target, then verify `nx affected` scope is correct
4. Add `dependsOn` in `project.json` or `targetDefaults` when target requires upstream artifact
5. Run `nx affected` with `--dry-run` to preview which projects will run
6. Validate `tags` on new projects — ensure module boundary lint rules apply correctly
7. For custom generators: run with `--dry-run` first; write e2e test in `tools/generators/*.spec.ts`
8. Clear Nx cache if config changes cause stale hits: `nx reset`

## Commands

```bash
nx graph                                          # visualize project graph
nx affected --target=build                        # build only affected projects
nx affected --target=test                         # test only affected projects
nx run-many --target=lint --all                   # lint all projects
nx reset                                          # clear local cache

# Generators
nx generate @nx/react:library my-lib --directory=libs/my-lib
nx generate @nx/node:application my-app
nx generate ./tools/generators/my-generator:name  # custom generator

# Executors
nx run my-app:my-target
nx run-many --target=build --projects=app1,lib1   # explicit project list

# Lint module boundaries
nx lint my-lib                                    # check boundary tags
```

## Validation checklist

- [ ] No cyclic dependencies in project graph — `nx graph` shows clean DAG
- [ ] New library has correct `tags` for module boundary lint enforcement
- [ ] Changed target name updated in all `dependsOn` references across workspace
- [ ] `namedInputs` changes reviewed — overly broad inputs expand affected scope
- [ ] `tsconfig.base.json` path aliases match actual library output paths
- [ ] CI uses `nx affected` — not `nx run-many --all` — to avoid full rebuild on every PR
- [ ] Custom generators include `--dry-run` test and `schema.json` with descriptions
