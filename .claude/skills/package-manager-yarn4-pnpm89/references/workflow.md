# Workflow

## Implementation steps

1. Confirm which manager the repo uses: check for `yarn.lock` (Yarn) or `pnpm-lock.yaml` (pnpm)
2. Check Corepack version pin in `package.json` `packageManager` field — use matching version
3. For dependency additions: use the correct workspace flag to target the right package

### Yarn 4

```bash
yarn add <pkg>                       # add to root
yarn workspace <ws-name> add <pkg>   # add to specific workspace
yarn workspaces foreach run build    # run build in all workspaces
yarn plugin import @yarnpkg/plugin-sdks  # one-time: install sdks plugin
yarn sdks vscode                         # update editor SDK (requires plugin above)
yarn dedupe                          # deduplicate lockfile entries
```

### pnpm 8/9

```bash
pnpm add <pkg>                              # add to root
pnpm add <pkg> --filter <ws-name>           # add to specific workspace
pnpm install                                # install after lockfile change
pnpm run --filter <ws-name> build           # run target in one workspace
pnpm -r run build                           # run build in all workspaces
pnpm dedupe                                 # deduplicate lockfile
```

## Validation checklist

- [ ] Never run `npm install` in a Yarn/pnpm managed repo — it corrupts lockfile
- [ ] `yarn.lock` / `pnpm-lock.yaml` committed after every dependency change
- [ ] Cross-workspace dependencies use `workspace:*` protocol — not `file:` paths
- [ ] No manually edited lockfile entries
- [ ] `.yarnrc.yml` `nodeLinker` unchanged unless intentional migration
- [ ] Corepack `packageManager` field matches CI toolchain version
- [ ] PnP mode: all tools work with PnP loader (check `.yarn/sdks` for editor support)
