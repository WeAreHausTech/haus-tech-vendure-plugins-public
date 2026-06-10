## Naming conventions

- Config file: `vite.config.ts` (TypeScript; `vite.config.js` only if TS not available)
- Client-exposed env vars: `VITE_*` prefix (e.g. `VITE_API_URL`)
- Path aliases: defined in `resolve.alias` in `vite.config.ts` mirroring `tsconfig.json` `paths` exactly
- Plugin imports: named imports from official packages (e.g. `import react from '@vitejs/plugin-react'`)
- SSR entry: `src/entry-server.ts`; client entry: `src/entry-client.ts` or `src/main.ts`

## Do / don't

DO: Keep `resolve.alias` in `vite.config.ts` in sync with `tsconfig.json` `paths` entries exactly — DON'T: define an alias in one without the other (IDE or build will break)
DO: Order plugins with framework plugin first (e.g. `react()`, `vue()`) followed by custom plugins — DON'T: place custom plugins before the framework plugin (can break HMR and transforms)
DO: Use `import.meta.env.VITE_*` for all client-side environment access — DON'T: use `process.env` in client code (not available in browser build)
DO: Split large dependencies via `build.rollupOptions.output.manualChunks` — DON'T: leave all vendor code in a single chunk for large apps
DO: Use `envPrefix` in `vite.config.ts` if the project uses a custom prefix — DON'T: expose non-`VITE_` vars to client bundle accidentally

## Forbidden patterns

NEVER: Path alias defined in `vite.config.ts` without a matching entry in `tsconfig.json paths` — causes IDE type errors on alias imports
NEVER: `VITE_` prefix on server-only secrets — automatically inlined into client JavaScript bundle
NEVER: Custom plugin placed before the framework plugin in the `plugins` array — breaks framework transforms
NEVER: `process.env` in client-side source files — throws at runtime in browser
NEVER: `define: { 'process.env.SECRET': ... }` for sensitive values — value is inlined as plaintext in the bundle
NEVER: SSR bundle that imports Node.js built-ins without `ssr.noExternal` or `ssr.external` config — breaks when bundled for non-Node targets
