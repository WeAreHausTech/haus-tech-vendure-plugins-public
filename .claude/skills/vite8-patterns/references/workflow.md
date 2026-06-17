# Workflow

## Implementation steps

1. Open `vite.config.ts`: check existing plugin order — order matters (e.g., `react()` before custom plugins)
2. For alias changes: add to `resolve.alias` AND matching `paths` in `tsconfig.json` — they must match
3. For new env variables: prefix with `VITE_` for client exposure; access via `import.meta.env.VITE_*`
4. For build chunking: configure `build.rollupOptions.output.manualChunks` to split vendor bundles
5. For SSR: add `ssr` entry in `vite.config.ts`; use `ssrLoadModule` for dynamic module loading
6. Test dev server: `vite dev` — confirm HMR works and proxy rules resolve correctly
7. Test production build: `vite build` — inspect `dist/` for correct output and no missing assets
8. For Vitest: confirm `vitest.config.ts` extends or shares base Vite config to avoid divergence

## Commands

```bash
vite dev                               # start dev server with HMR
vite build                             # production build
vite preview                           # preview production build locally
vite build --mode staging              # build with specific .env mode

# Bundle analysis
yarn vite-bundle-visualizer             # after build, open stats.html
yarn rollup-plugin-visualizer           # alternative if plugin configured

# Type check
yarn tsc --noEmit

# Vitest
yarn vitest                             # run tests in watch mode
yarn vitest run                         # single run
yarn vitest --coverage                  # with coverage
```

## Validation checklist

- [ ] `resolve.alias` entries match `tsconfig.json` `paths` exactly — divergence causes type errors in IDE
- [ ] `VITE_` prefix on all env vars intended for client bundle
- [ ] Plugin order preserved — framework plugin (`react()`, `vue()`) comes before custom transforms
- [ ] Production build outputs to `dist/` with correct entry filenames for deployment
- [ ] SSR build does not bundle Node.js built-ins into client bundle
- [ ] No `define` values expose secrets — only public build-time constants
- [ ] `vite preview` confirms production build serves assets correctly from `dist/`
