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

  it('shares the exact application CSS cascade with Storybook, including the tools IA', () => {
    const app = read('src/main.tsx');
    const preview = read('.storybook/preview.ts');
    const imports = (source: string) => [...source.matchAll(/import ['"](?:\.\/ui\/|\.\.\/src\/ui\/)([^'"]+\.css)['"];/g)].map((match) => match[1]);
    expect(imports(preview)).toEqual(imports(app));
    expect(preview).toContain("order: ['Fondations', 'Composants', 'Parcours enseignant', 'Outils IA']");
  });

  it('publishes Storybook next to the app and provides real teacher and technical reference stories', () => {
    const workflow = read('.github/workflows/deploy-pages.yml');
    expect(workflow).toContain('npm run build-storybook -- --output-dir dist/storybook');
    expect(workflow).toContain('test -s dist/index.html && test -s dist/storybook/index.html');
    expect(workflow).toContain('path: dist');
    const teacher = read('src/ui/CorrectionOverview.stories.tsx');
    const states = read('src/ui/design-system/foundations/AtelierBStates.stories.tsx');
    expect(teacher).toContain('<CorrectionOverview');
    expect(teacher).toContain("status: 'processing'");
    expect(teacher).toContain("status: 'failed'");
    expect(states).toContain('Contrat des états B');
    expect(states).toContain('network-state pending');
    expect(states).toContain('evaluation-archive-feedback is-failed');
    expect(states).toContain('review-card is-flagged');
    expect(states).toContain('var(--ds-color-progress)');
    expect(states).toContain('var(--ds-color-warning)');
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
