import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('design system foundations', () => {
  it('defines a single documented token scale for color, spacing and shape', () => {
    const tokens = read('src/ui/design-system/tokens.css');
    expect(tokens).toContain('--ds-color-brand-700');
    expect(tokens).toContain('--ds-space-4: 16px');
    expect(tokens).toContain('--ds-radius-md');
    expect(tokens).toContain('--ds-focus-ring');
  });

  it('provides consistent keyboard focus and disabled states for shared controls', () => {
    const controls = read('src/ui/design-system/controls.css');
    expect(controls).toContain('.ds-input:focus-visible');
    expect(controls).toContain('.design-system-select:focus-visible');
    expect(controls).toContain('.ds-button:focus-visible');
    expect(controls).toContain(':disabled');
    expect(controls).toContain('prefers-reduced-motion');
  });

  it('keeps field validation messages available to assistive technology', () => {
    const field = read('src/ui/design-system/components/Field.tsx');
    expect(field).toContain('aria-hidden="true"');
    expect(field).toContain('role="alert"');
    expect(field).toContain('aria-describedby');
  });

  it('keeps native form semantics in shared input components', () => {
    expect(read('src/ui/design-system/components/TextInput.tsx')).toContain('InputHTMLAttributes');
    expect(read('src/ui/design-system/components/TextArea.tsx')).toContain('TextareaHTMLAttributes');
    expect(read('src/ui/design-system/components/Checkbox.tsx')).toContain('type="checkbox"');
    expect(read('src/ui/design-system/components/Button.tsx')).toContain("type = 'button'");
  });
});
