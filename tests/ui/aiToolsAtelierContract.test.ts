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
    expect(navigation).toContain('font: 700 clamp(');
    expect(navigation).toContain('var(--ds-font-editorial)');
    expect(navigation).toContain('.developer-tools-link.is-active');
    expect(navigation).toContain('var(--ds-color-brand-700)');
    expect(navigation).toContain('var(--ds-focus-ring)');
    expect(navigation).toContain('prefers-reduced-motion');
    const component = read('src/ui/DeveloperToolsNavigation.tsx');
    expect(component).toContain('<details className="developer-tools-support">');
    expect(component).toContain('<Button variant="secondary"');
  });

  it('uses the same informational progress colors as the teacher flow for pending network calls', () => {
    const pending = css.split('.ai-tools-view :is(.network-state.pending,.network-waiting-hint) {')[1]?.split('}')[0] ?? '';
    expect(pending).toContain('color:var(--ds-color-progress)');
    expect(pending).not.toContain('var(--ds-color-warning)');
    expect(css).toContain('.ai-tools-view .network-pending-badge');
    expect(css).toContain('background:var(--ds-color-progress-surface)');
    expect(css).not.toContain('.evaluation-step-nav button[aria-current="step"],.evaluation-profile-option.is-selected');
    expect(css).not.toContain('.evaluation-history-bar-fill,.evaluation-progress-track > span');
  });

  it('aligns six network columns and keeps the intent visible on mobile', () => {
    expect(css).toContain('grid-template-columns:56px 56px minmax(100px,1.1fr) minmax(105px,1fr) 45px 66px');
    expect(css).toContain(':nth-child(3),:nth-child(6)');
    expect(css).toContain(':nth-child(4) { grid-column:3; }');
    expect(read('src/ui/NetworkInspector.tsx')).toContain('<section className="network-inspector"');
  });
});
