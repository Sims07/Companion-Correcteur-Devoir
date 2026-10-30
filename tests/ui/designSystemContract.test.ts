import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Field } from '../../src/ui/design-system/components/Field.tsx';
import { TextInput } from '../../src/ui/design-system/components/TextInput.tsx';

const read = (path: string) => readFileSync(path, 'utf8');

describe('design system foundations', () => {
  it('defines a single documented token scale for color, spacing and shape', () => {
    const tokens = read('src/ui/design-system/tokens.css');
    expect(tokens).toContain('--ds-color-brand-700');
    expect(tokens).toContain('--ds-space-4: 16px');
    expect(tokens).toContain('--ds-radius-md');
    expect(tokens).toContain('--ds-focus-ring');
  });

  it('provides consistent keyboard focus and disabled states for shared and native controls', () => {
    const controls = read('src/ui/design-system/controls.css');
    expect(controls).toContain('.ds-input:focus-visible');
    expect(controls).toContain('.design-system-select:focus-visible');
    expect(controls).toContain('select:not([multiple])');
    expect(controls).toContain('.ds-button:focus-visible');
    expect(controls).toContain(':disabled');
    expect(controls).toContain('prefers-reduced-motion');
  });

  it('connects field labels, hints and validation errors to the rendered control', () => {
    const markup = renderToStaticMarkup(createElement(Field, {
      label: 'Nom du devoir',
      htmlFor: 'assignment-name',
      hint: 'Visible dans votre espace local.',
      error: 'Ce champ est obligatoire.',
      required: true,
      children: createElement(TextInput, { id: 'assignment-name' }),
    }));

    expect(markup).toContain('for="assignment-name"');
    expect(markup).toContain('aria-describedby="assignment-name-hint assignment-name-error"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('required=""');
    expect(markup).toContain('role="alert"');
  });

  it('keeps native form semantics in shared input components', () => {
    expect(read('src/ui/design-system/components/TextInput.tsx')).toContain('InputHTMLAttributes');
    expect(read('src/ui/design-system/components/TextArea.tsx')).toContain('TextareaHTMLAttributes');
    expect(read('src/ui/design-system/components/Checkbox.tsx')).toContain('type="checkbox"');
    expect(read('src/ui/design-system/components/Button.tsx')).toContain("type = 'button'");
  });
});
