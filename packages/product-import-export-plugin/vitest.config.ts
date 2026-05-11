import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'

export default defineConfig({
  test: {
    dir: 'packages/product-import-export-plugin',
    include: ['e2e/**/*.e2e-spec.ts'],
    environment: 'node',
    globals: true,
    hookTimeout: 120_000,
    passWithNoTests: true,
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          useDefineForClassFields: false,
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
})
