import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Field } from '../../src/shared/ui/design-system/components/Field.tsx';
import { TextInput } from '../../src/shared/ui/design-system/components/TextInput.tsx';

const read = (path: string) => readFileSync(path, 'utf8');

describe('design system foundations', () => {
  it('defines a single documented token scale for color, spacing and shape', () => {
    const tokens = read('src/shared/ui/design-system/tokens.css');
    expect(tokens).toContain('--ds-color-brand-700');
    expect(tokens).toContain('--ds-space-4: 16px');
    expect(tokens).toContain('--ds-radius-md');
    expect(tokens).toContain('--ds-focus-ring');
  });

  it('provides consistent keyboard focus and disabled states for shared and native controls', () => {
    const controls = read('src/shared/ui/design-system/controls.css');
    expect(controls).toContain('.ds-input:focus-visible');
    expect(controls).toContain('.design-system-select:focus-visible');
    expect(controls).toContain('select:not([multiple])');
    expect(controls).toContain('.ds-button:focus-visible');
    expect(controls).toContain(':disabled');
    expect(controls).toContain('prefers-reduced-motion');
  });

  it('keeps command buttons recognizable across ivory, page and ochre surfaces', () => {
    const tokens = read('src/shared/ui/design-system/tokens.css');
    const controls = read('src/shared/ui/design-system/controls.css');
    const theme = read('src/shared/ui/design-system/application-theme.css');
    const story = read('src/shared/ui/design-system/components/Button.stories.tsx');

    const hex = (name: string) => {
      const value = tokens.match(new RegExp(`^\\s*${name}:\\s*(#[0-9a-f]{6});`, 'mi'))?.[1];
      expect(value, `missing token ${name}`).toBeTruthy();
      return value!;
    };
    const luminance = (color: string) => {
      const rgb = [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16) / 255);
      return rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    };
    const contrast = (a: string, b: string) => {
      const values = [luminance(a), luminance(b)].sort((left, right) => right - left);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const outline = hex('--ds-color-brand-700');
    const secondary = hex('--ds-color-brand-100');
    for (const paper of ['--ds-color-surface', '--ds-color-surface-subtle', '--ds-color-brand-100']) {
      expect(contrast(outline, hex(paper))).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(hex('--ds-color-text'), secondary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(outline, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(tokens).toContain('--ds-shadow-action');
    expect(controls).toContain('border: 2px solid transparent');
    expect(controls).toContain('.ds-button--secondary { border-color: var(--ds-color-brand-700)');
    expect(theme).toMatch(/\.secondary-button,\s*\.teacher-ai-settings-button \{[^}]*border: 2px solid var\(--ds-color-brand-700\)/s);
    expect(story).toContain('SurfacesContrastees');
    expect(story).toContain("Panneau ocre");
  });

  it('keeps independent action buttons spaced and selected modes distinct across screens', () => {
    const controls = read('src/shared/ui/design-system/controls.css');
    const tokens = read('src/shared/ui/design-system/tokens.css');
    const story = read('src/shared/ui/design-system/components/Button.stories.tsx');
    expect(tokens).toContain('--ds-space-2: 8px');
    expect(tokens).toContain('--ds-space-3: 12px');
    expect(controls).toMatch(/\\.ds-action-group\\s*\\{[^}]*display: flex;[^}]*flex-wrap: wrap;[^}]*gap: var\\(--ds-space-2\\) var\\(--ds-space-3\\)/s);
    expect(controls).toContain('.ds-button--secondary[aria-pressed="true"]');
    expect(controls).toMatch(/\\.ds-action-group > a\\s*\\{[^}]*min-height: 44px/s);
    expect(story).toContain('GroupesDActions');
    expect(story).toContain('aria-pressed="true"');
  });

  it('shares the exact application CSS cascade with Storybook, including the tools IA', () => {
    const app = read('src/main.tsx');
    const preview = read('.storybook/preview.ts');
    const imports = (source: string) => [...source.matchAll(/import ['"](?:\.\/|\.\.\/src\/)([^'"]+\.css)['"];/g)].map((match) => match[1]);
    expect(imports(app)).toContain('correction/ui/teacherAtelier.css');
    expect(imports(preview)).toEqual(imports(app));
    expect(preview).toContain("order: ['Fondations', 'Composants', 'Parcours enseignant', 'Outils IA']");
  });

  it('publishes Storybook next to the app and provides real teacher and technical reference stories', () => {
    const workflow = read('.github/workflows/deploy-pages.yml');
    expect(workflow).toContain('npm run build-storybook -- --output-dir dist/storybook');
    expect(workflow).toContain('test -s dist/index.html && test -s dist/storybook/index.html');
    expect(workflow).toContain('path: dist');
    const teacher = read('src/correction/ui/CorrectionOverview.stories.tsx');
    const states = read('src/correction/ui/stories/AtelierBStates.stories.tsx');
    expect(teacher).toContain('<CorrectionOverview');
    expect(teacher).toContain("status: 'processing'");
    expect(teacher).toContain("status: 'failed'");
    expect(states).toContain('Contrat des états B');
    expect(states).toContain('network-state pending');
    expect(states).toContain('evaluation-archive-feedback is-failed');
    expect(states).toContain('review-card is-flagged');
    expect(states).toContain("token: '--ds-color-progress'");
    expect(states).toContain("token: '--ds-color-warning'");
    expect(states).toContain("background: 'var(' + item.token + ')'");
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
    expect(read('src/shared/ui/design-system/components/TextInput.tsx')).toContain('InputHTMLAttributes');
    expect(read('src/shared/ui/design-system/components/TextArea.tsx')).toContain('TextareaHTMLAttributes');
    expect(read('src/shared/ui/design-system/components/Checkbox.tsx')).toContain('type="checkbox"');
    expect(read('src/shared/ui/design-system/components/Button.tsx')).toContain("type = 'button'");
  });
});
