import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const testsWorkflow = readFileSync(new URL('../.github/workflows/tests.yml', import.meta.url), 'utf8');
const pagesWorkflow = readFileSync(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8');

describe('CI coverage badge and Pages publication', () => {
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
});
