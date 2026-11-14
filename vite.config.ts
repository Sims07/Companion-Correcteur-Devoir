import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolveBasePath } from './scripts/pagesBase.ts';

declare const process: {
  env: Record<string, string | undefined>;
};

const appVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;
const appRevision = process.env.GITHUB_SHA ||
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() || null;

export default defineConfig({
  plugins: [react(), {
    name: 'app-version-manifest',
    apply: 'build',
    generateBundle() {
      // Serve this uncached metadata separately from the offline PWA shell.
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: appVersion, revision: appRevision }),
      });
    },
  }],
  define: {
    'import.meta.env.VITE_EVALUATION_REVISION': JSON.stringify(appRevision),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
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
