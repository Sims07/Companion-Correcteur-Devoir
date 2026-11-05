import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const channel = (value: number) => {
  const linear = value / 255;
  return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const rgb = [1, 3, 5].map((at) => channel(Number.parseInt(hex.slice(at, at + 2), 16)));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};
const getToken = (css: string, key: string): string => {
  const match = css.match(new RegExp('--' + key + ':\\s*(#[0-9a-fA-F]{6})\\s*;'));
  if (!match) throw new Error('Missing color token: ' + key);
  return match[1];
};

describe('Atelier pédagogique visual identity', () => {
  const tokens = read('src/ui/design-system/tokens.css');
  const theme = read('src/ui/design-system/application-theme.css');

  it('uses the professor-selected warm paper and terracotta palette', () => {
    expect(getToken(tokens, 'ds-color-surface-subtle')).toBe('#fbf8f2');
    expect(getToken(tokens, 'ds-color-surface')).toBe('#fffdf9');
    expect(getToken(tokens, 'ds-color-brand-700')).toBe('#a14d37');
    expect(getToken(tokens, 'ds-color-brand-100')).toBe('#f7e8dc');
    expect(getToken(tokens, 'ds-color-border')).toBe('#e9e1d5');
  });

  it('maintains WCAG AA contrast for text, action labels and focus', () => {
    const surface = getToken(tokens, 'ds-color-surface');
    expect(contrast(getToken(tokens, 'ds-color-text'), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(getToken(tokens, 'ds-color-text-muted'), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(getToken(tokens, 'ds-color-brand-700'), surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', getToken(tokens, 'ds-color-brand-700'))).toBeGreaterThanOrEqual(4.5);
  });

  it('shares the theme with the teacher flow and preserves focus and motion rules', () => {
    expect(theme).toContain('--flow-accent: var(--ds-color-brand-700)');
    expect(theme).toContain('.teacher-step.active');
    expect(theme).toContain('font-family: var(--ds-font-editorial)');
    expect(theme).toContain('@media (prefers-reduced-motion: reduce)');
    expect(read('src/ui/design-system/controls.css')).toContain('var(--ds-focus-ring)');
  });
});
