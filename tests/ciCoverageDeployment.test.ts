import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const testsWorkflow = readFileSync(new URL('../.github/workflows/tests.yml', import.meta.url), 'utf8');
const vitestConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const pagesWorkflow = readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');

describe('CI coverage badge and Pages publication', () => {
  it('executes colocated tests and rejects line coverage below 80%', () => {
    expect(vitestConfig).toContain("'src/**/*.test.ts'");
    expect(vitestConfig).toContain("'src/**/*.test.tsx'");
    expect(vitestConfig).toContain("'tests/**/*.test.tsx'");
    expect(vitestConfig).toMatch(/thresholds:\s*\{\s*lines:\s*80\s*\}/);
    expect(testsWorkflow).toContain('npm run test:coverage');
    expect(testsWorkflow).toContain('npm run test:coverage:core');
  });

  it('does not restart the complete test workflow for an updated badge', () => {
    expect(testsWorkflow).toContain("paths-ignore:\n      - 'badges/coverage.json'");
    expect(testsWorkflow).toContain('git push origin HEAD:main');
  });

  it('allows badge changes to publish the most recent main revision', () => {
    expect(testsWorkflow).toContain('git commit -m "chore: update coverage badge"');
    expect(testsWorkflow).not.toContain('[skip ci]');
    expect(pagesWorkflow).toContain('branches: [main]');
    expect(pagesWorkflow).not.toContain('paths-ignore:');
  });

  it('isolates PR builds from production Pages deployments', () => {
    expect(pagesWorkflow).toContain('group: pages-${{ github.ref }}');
    expect(pagesWorkflow).toContain('cancel-in-progress: true');
    expect(pagesWorkflow).toContain('uses: actions/deploy-pages@v4');
  });

  it('publishes a release only after Pages deploys a main build with the matching tag', () => {
    expect(pagesWorkflow).toContain('VITE_APP_RELEASE_TAG:');
    expect(pagesWorkflow).toContain("format('companion-auto-{0}-{1}', github.run_number, github.sha)");
    expect(pagesWorkflow).toContain("if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'");
    expect(pagesWorkflow).toContain('needs: deploy');
    expect(pagesWorkflow).toContain('contents: write');
    expect(pagesWorkflow).toContain('tag="companion-auto-${GITHUB_RUN_NUMBER}-${GITHUB_SHA}"');
    expect(pagesWorkflow).toContain('gh release create "$tag"');
    expect(pagesWorkflow).toContain('--target "$GITHUB_SHA"');
    expect(pagesWorkflow).toContain('--generate-notes');
    expect(pagesWorkflow).toContain('--latest');
  });

  it('retains exactly three automatic releases while protecting manual releases and all unrelated tags', () => {
    expect(pagesWorkflow).toContain('gh api --paginate');
    expect(pagesWorkflow).toContain('.draft == false');
    expect(pagesWorkflow).toContain('startswith("companion-auto-")');
    expect(pagesWorkflow).toContain('sort_by(.published_at) | reverse | .[3:]');
    expect(pagesWorkflow).toContain('gh release delete "$tag" --yes --cleanup-tag');
    expect(pagesWorkflow).not.toContain('dev-drprasad/delete-older-releases');
  });
});
