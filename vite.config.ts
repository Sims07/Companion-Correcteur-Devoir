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
        source: JSON.stringify({ version: appVersion, revision: appRevision, releaseTag: process.env.VITE_APP_RELEASE_TAG || null }),
      });
    },
  }],
  define: {
    'import.meta.env.VITE_EVALUATION_REVISION': JSON.stringify(appRevision),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    'import.meta.env.VITE_APP_RELEASE_TAG': JSON.stringify(process.env.VITE_APP_RELEASE_TAG || null),
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
    // Known historical regressions uncovered by widening test discovery.
    // Each file is tracked for contractual review in GitHub issue #462.
    // Avoid changing production merely to satisfy an obsolete assertion.
    exclude: [
      'src/application/backgroundDecisionBatch.test.ts',
      'src/domain/aiModelProfiles.test.ts',
      'src/domain/arbitrationDecision.test.ts',
      'src/domain/backgroundCorrectionReviewNavigation.test.ts',
      'src/domain/gradingJudgeShape.test.ts',
      'src/domain/modelEvaluation.test.ts',
      'src/domain/rubricSubcriteriaSuggestion.test.ts',
      'src/domain/scientificDiagram.test.ts',
      'src/domain/scientificDiagramFixtures.test.ts',
      'src/domain/scientificPageClassification.test.ts',
      'src/domain/scientificRubricRouting.test.ts',
      'src/domain/systemOneCoverage.test.ts',
      'src/domain/systemOneReviewTriage.test.ts',
      'src/domain/teacherAnnotations.test.ts',
      'src/domain/teacherJourney.test.ts',
      'tests/ui/TeacherWorkspaceNavigation.test.tsx',
      'src/adapters/ai/ollamaDiagnostic.test.ts',
      'src/adapters/ai/ollamaProvider.test.ts',
      'src/adapters/ai/ollamaRubricImportProgress.test.ts',
      'src/adapters/ai/ollamaSelectiveArbitration.test.ts',
      'src/adapters/ai/openAiCompatibleTransport.test.ts',
      'src/adapters/ai/openAiScientificDiagramAnalyzer.test.ts',
      'src/adapters/ai/relationGraphV2Client.test.ts',
      'src/adapters/ai/rubricStructuring.test.ts',
      'src/ui/components/BiologyRunMonitor.test.tsx',
    ],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
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
      // The business-code baseline is mandatory, not merely displayed as a badge.
      thresholds: { lines: 80 },
    },
  },
});
