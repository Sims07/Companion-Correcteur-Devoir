import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(name, 'utf8');

describe('Atelier pédagogique — Outils IA', () => {
  const css = read('src/ui/aiToolsAtelier.css');
  const navigation = read('src/ui/developerTools.css');

  it('isolates the new palette from the teacher workspace and loads it after legacy rules', () => {
    const entry = read('src/main.tsx');
    expect(entry.indexOf("import './ui/aiToolsAtelier.css'")).toBeGreaterThan(entry.indexOf("import './ui/atelierBLayout.css'"));
    expect(read('src/ui/App.tsx')).toContain("'app-shell ai-tools-view'");
    expect(css).toContain('.ai-tools-view');
    expect(css).toContain('var(--ds-color-brand-700)');
    expect(css).toContain('var(--ds-color-surface)');
    expect(css).toContain('var(--ds-color-danger)');
  });

  it('uses the shared visual language for navigation and keeps support actions secondary', () => {
    const app = read('src/ui/App.tsx');
    const header = read('src/ui/design-system/application-theme.css');
    expect(app).toContain('aria-label="Navigation principale"');
    expect(header).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(navigation).toContain('.developer-tools-subnav button.is-active');
    expect(navigation).not.toContain('.developer-tools-link');
    expect(navigation).toContain('var(--ds-color-brand-700)');
    expect(navigation).toContain('var(--ds-focus-ring)');
    expect(navigation).toContain('prefers-reduced-motion');
    const component = read('src/ui/DeveloperToolsNavigation.tsx');
    expect(component).toContain('<details className="developer-tools-support">');
    expect(component).toContain('if (evaluating) return null;');
    expect(component).toContain('<div className="developer-tools-diagnostics">');
    expect(component).toContain('<Button variant="secondary"');
  });

  it('keeps pending network calls informational and separates work from model selection', () => {
    const current = css.split('/* Selection is brand-coloured;')[1]?.split('}')[0] ?? '';
    expect(current).toContain('var(--ds-color-progress-border)');
    expect(current).not.toContain('var(--ds-color-brand-700)');
    expect(css).toContain('.evaluation-history-option.is-selected');
    expect(css).toContain('box-shadow:inset 3px 0 var(--ds-color-brand-700)');
    expect(css).toContain('.network-state.pending,.network-waiting-hint) { color:var(--ds-color-progress); }');
    expect(css).toContain('.evaluation-progress-track > span { background:var(--ds-color-progress); }');
    expect(css).toContain('.observability-local-badge span { background:var(--ds-color-text-muted);');
    expect(css).toContain('box-shadow:var(--ds-focus-ring)');
  });

  it('aligns six network columns and keeps the intent visible on mobile', () => {
    expect(css).toContain('grid-template-columns:56px 56px minmax(100px,1.1fr) minmax(105px,1fr) 45px 66px');
    expect(css).toContain(':nth-child(3),:nth-child(6)');
    expect(css).toContain(':nth-child(4) { grid-column:3; }');
    expect(read('src/ui/NetworkInspector.tsx')).toContain('<section className="network-inspector"');
  });
});
