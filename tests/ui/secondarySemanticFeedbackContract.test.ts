import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const file = (path: string) => readFileSync(path, 'utf8');

describe('semantics on secondary teacher tools', () => {
  it('does not announce import warnings and cancellations as successes', () => {
    const app = file('src/ui/App.tsx');
    expect(app).toContain("setRubricImportTone(imported.warnings.length ? 'warning' : 'success')");
    expect(app).toContain("setRubricImportTone('warning'); setRubricImportMessage(message)");
    expect(app).toContain('<StatusNotice tone={rubricImportTone}>');
  });

  it('distinguishes successful and failing local memory operations', () => {
    const memory = file('src/ui/LocalMemoryCompanion.tsx');
    expect(memory).toContain("setStatusTone('success')");
    expect(memory).toContain("setStatusTone('error')");
    expect(memory).toContain("setStatusTone('info')");
    expect(memory).toContain('<StatusNotice tone={statusTone}>');
    expect(file('src/ui/localMemory.css')).not.toContain('.memory-status');
  });

  it('provides explicit feedback for rubric import, export and subcriteria allocation', () => {
    const importer = file('src/ui/components/RubricImportPanel.tsx');
    const exporter = file('src/ui/components/RubricExportPanel.tsx');
    const suggested = file('src/ui/components/SubcriteriaSuggestionPanel.tsx');
    expect(importer).toContain("setMessageTone(conflicts ? 'warning' : 'info')");
    expect(importer).toContain('<StatusNotice tone="error">');
    expect(exporter).toContain("setMessageTone('error')");
    expect(suggested).toContain("<StatusNotice tone={valid ? 'success' : 'warning'}>");
    expect(suggested).toContain("setMessageTone('error')");
  });

  it('keeps local memory and storage telemetry neutral until a semantic warning or error occurs', () => {
    const memory = file('src/ui/localMemory.css');
    const storage = file('src/ui/storageUsagePanel.css');
    const panel = file('src/ui/StorageUsagePanel.tsx');
    expect(memory).toContain('.memory-step { background: var(--ds-color-surface-subtle); color: var(--ds-color-text-muted); }');
    expect(memory).toContain('border-left-color: var(--ds-color-border-strong)');
    expect(storage).toContain('background:var(--ds-color-progress); border-radius:inherit; transition: width');
    expect(storage).toContain('.storage-usage-notice.is-warning');
    expect(storage).toContain('.storage-usage-notice.is-error');
    expect(panel).toContain('className="storage-usage-notice is-error" role="alert"');
    expect(panel).toContain('className="storage-usage-notice is-warning" role="status"');
  });

  it('no longer uses the retired blue-green token fallbacks in rubric panels', () => {
    for (const name of ['RubricImportPanel.css', 'RubricExportPanel.css']) {
      const css = file(`src/ui/components/${name}`);
      expect(css).toContain('var(--ds-color-surface-subtle)');
      expect(css).toContain('var(--ds-color-brand-700)');
      expect(css).toContain('var(--ds-color-text-muted)');
      expect(css).not.toMatch(/var\(--(?:accent|border-subtle|text-secondary|surface-hover)[,)]/);
    }
  });
});
