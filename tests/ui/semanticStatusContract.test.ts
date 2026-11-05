import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('semantic feedback and Atelier B consistency', () => {
  it('types profile messages by outcome, including storage failures', () => {
    const app = read('src/ui/App.tsx');
    expect(app).toContain("setAiModelProfileTone('success');");
    expect(app).toContain("setAiModelProfileTone('error');");
    expect(app).toContain("setAiModelProfileTone('warning');");
    expect(app).toContain("setAiModelProfileTone('info');");
    expect(app).toContain('<StatusNotice tone={aiModelProfileTone}>');
    expect(app).toContain('<StatusNotice tone={connectionTone}>');
    expect(app).not.toContain('className="evaluation-profile-message"');
  });

  it('shares dedicated success/info/warning/error tokens instead of the brand red', () => {
    const controls = read('src/ui/design-system/controls.css');
    const tokens = read('src/ui/design-system/tokens.css');
    for (const tone of ['success', 'info', 'warning', 'error']) {
      expect(controls).toContain(`.ds-status-notice--${tone}`);
    }
    expect(controls).toContain('--ds-status-accent: var(--ds-color-success)');
    expect(controls).toContain('--ds-status-accent: var(--ds-color-warning)');
    expect(controls).toContain('--ds-status-accent: var(--ds-color-danger)');
    expect(tokens).toContain('--ds-color-success-surface');
    expect(read('src/ui/aiToolsAtelier.css')).not.toContain('.evaluation-profile-message');
  });

  it('distinguishes technical storage measurement from warning and failure', () => {
    const storage = read('src/ui/StorageUsagePanel.tsx');
    const css = read('src/ui/storageUsagePanel.css');
    expect(storage).toContain('className="storage-usage-notice is-running" role="status"');
    expect(storage).toContain('className="storage-usage-notice is-error" role="alert"');
    expect(storage).toContain('className="storage-usage-notice is-warning" role="status"');
    expect(css).toContain('.storage-usage-notice.is-running');
    expect(css).toContain('.storage-usage-notice.is-error');
    expect(css).toContain('.storage-usage-notice.is-warning');
    expect(css).toContain('background:var(--ds-color-progress)');
    expect(css).not.toContain('background:var(--ds-color-brand-700)');
  });

  it('overrides historical green configuration surfaces with semantic Atelier B tokens', () => {
    const layout = read('src/ui/modelEvaluationWorkspace.css');
    expect(layout).toContain('.evaluation-workspace-shell .evaluation-thinking-option');
    expect(layout).toContain('accent-color: var(--ds-color-brand-700)');
    expect(layout).toContain('.evaluation-workspace-shell .evaluation-config-field .field-label');
    expect(layout).toContain('color: var(--ds-color-text-muted)');
    expect(layout).toContain('border-color: var(--ds-color-brand-600)');
  });
});
