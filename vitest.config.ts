import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import path from 'path';

export default defineConfig({
  test: {
    include: ['packages/**/*.e2e-spec.ts'],
    typecheck: {
        tsconfig: path.join(__dirname, 'tsconfig.e2e.json'),
    },
    environment: 'node',
    globals: true,
    hookTimeout: 120_000,
    passWithNoTests: true,
    deps: { inline: ['@vendure/testing'] },
  },
  resolve: {
    alias: {
      '@plugins': path.resolve(__dirname, 'packages'),
    },
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
});
