import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
