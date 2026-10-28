import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');

describe('UI design system', () => {
  it('defines a shared spacing scale and reusable surface tokens', () => {
    expect(stylesheet).toContain('--space-1: 4px');
    expect(stylesheet).toContain('--space-8: 32px');
    expect(stylesheet).toContain('--surface-subtle: #f8faf7');
    expect(stylesheet).toContain('--text-secondary: #647467');
  });

  it('provides visible keyboard focus states for interactive controls', () => {
    expect(stylesheet).toContain('button:focus-visible');
    expect(stylesheet).toContain('input:focus-visible');
    expect(stylesheet).toContain('textarea:focus-visible');
    expect(stylesheet).toContain('outline: 3px solid');
  });

  it('adapts the layout for narrow mobile viewports', () => {
    expect(stylesheet).toContain('@media (max-width: 560px)');
    expect(stylesheet).toContain('@media (max-width: 380px)');
    expect(stylesheet).toContain('.view-switch-button { flex: 1;');
  });

  it('respects reduced-motion preferences', () => {
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesheet).toContain('animation-duration: .01ms');
  });
});
