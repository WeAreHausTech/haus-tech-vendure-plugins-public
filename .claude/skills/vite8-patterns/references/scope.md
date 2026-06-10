# Scope

## In-scope files and dirs

- `vite.config.ts` / `vite.config.js` — plugins, resolve aliases, build options, server config
- `.env`, `.env.local`, `.env.production`, `.env.test` — Vite environment variable files
- `src/vite-env.d.ts` — ambient type declarations for `import.meta.env`
- `index.html` — Vite entry point HTML template
- `postcss.config.js` — PostCSS config consumed by Vite CSS pipeline
- `vitest.config.ts` — Vitest test runner config (extends or separate from `vite.config.ts`)
- `public/**` — static assets copied as-is to output

## Stack boundaries

- Vite 8: ESM-native dev server, Rollup-based production build, HMR
- Plugins: `@vitejs/plugin-react`, `@vitejs/plugin-vue`, `vite-plugin-svgr`, etc.
- SSR: `vite.ssrBuild`, `ssrLoadModule`, `ssrTransformResult` for server-side rendering
- Not in scope: framework component logic with no Vite build configuration impact
- Not in scope: backend-only service/API code not part of the frontend bundle

## Triggers

- Adding or configuring a Vite plugin
- Changing `resolve.alias` (must match `tsconfig.json` paths)
- Adding or changing `define` constants or `import.meta.env` variables
- Changing `build.rollupOptions` (chunking, external deps, output format)
- Adding SSR entry point configuration
- Changing `server.proxy` rules for local API proxying
- Upgrading Vite major version
