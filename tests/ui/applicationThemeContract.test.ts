import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('application design-system integration', () => {
  it('loads the shared application theme after the foundational tokens and controls', () => {
    const entrypoint = read('src/main.tsx');
    const tokensIndex = entrypoint.indexOf("./ui/design-system/tokens.css");
    const controlsIndex = entrypoint.indexOf("./ui/design-system/controls.css");
    const themeIndex = entrypoint.indexOf("./ui/design-system/application-theme.css");

    expect(tokensIndex).toBeGreaterThan(-1);
    expect(controlsIndex).toBeGreaterThan(tokensIndex);
    expect(themeIndex).toBeGreaterThan(controlsIndex);
  });

  it('uses shared semantic tokens across correction, evaluation and observability surfaces', () => {
    const theme = read('src/ui/design-system/application-theme.css');

    for (const selector of [
      '.app-shell',\n      '.evaluation-workspace-shell',\n      '.evaluation-step-nav button',\n      '.evaluation-config-workspace',\n      '.evaluation-results-workspace',\n      '.evaluation-history-option',\n      '.view-switch',
      '.panel',
      '.assignment-overview-card',
      '.teacher-workspace-navigation',
      '.teacher-copy-rail',
      '.copy-review-header',
      '.observability-workspace',
      '.observability-panel',
      '.observability-kpi',
      '.memory-panel',
    ]) {
      expect(theme).toContain(selector);
    }

    expect(theme).toContain('var(--ds-color-surface-subtle)');
    expect(theme).toContain('var(--ds-color-border)');
    expect(theme).toContain('var(--ds-radius-lg)');
    expect(theme).toContain('var(--ds-focus-ring)');\n    expect(theme).toContain('.view-switch-button.active');\n    expect(theme).toContain('.evaluation-history-option.is-selected');
  });

  it('keeps interactive states accessible and respects reduced-motion preferences', () => {
    const theme = read('src/ui/design-system/application-theme.css');

    expect(theme).toContain(':focus-visible');
    expect(theme).toContain(':disabled');
    expect(theme).toContain('@media (max-width: 760px)');
    expect(theme).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
