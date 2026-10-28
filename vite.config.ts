import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolveBasePath } from './scripts/pagesBase.ts';

declare const process: {
  env: Record<string, string | undefined>;
};

export default defineConfig({
  plugins: [react()],
  // GitHub Pages publishes this project under /Companion-Correcteur-Devoir/.
  // Keep the root path for local development and use the repository path in CI.
  base: resolveBasePath(process.env.GITHUB_ACTIONS === 'true'),
  // PDF.js and its worker must be served from the same, un-prebundled package
  // version. Vite's dependency optimizer can otherwise rewrite the worker URL
  // and trigger PDF.js's "Setting up fake worker" dynamic-import failure.
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        '**/*.test.*',
        'src/ports/**', // Type-only contracts do not represent executable behavior.
        'src/main.tsx',
        // UI composition will be measured separately by browser E2E tests.
        'src/ui/**',
      ],
      reporter: ['text', 'text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage-unit',
    },
  },
});
