import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Atelier pédagogique teacher workspace', () => {
  it('loads the teacher-specific composition after shared design-system styles', () => {
    const source = read('src/main.tsx');
    expect(source.indexOf('./ui/teacherAtelier.css')).toBeGreaterThan(source.indexOf('./ui/design-system/application-theme.css'));
    const storybook = read('.storybook/preview.ts');
    expect(storybook).toContain('../src/ui/teacherAtelier.css');
  });

  it('preserves assignment actions and accessible keyboard states in the warm theme', () => {
    const css = read('src/ui/teacherAtelier.css');
    for (const selector of [
      '.assignments-home-heading h2',
      '.assignment-overview-card',
      '.assignment-overview-title h3',
      '.assignment-creation-panel',
      '.rubric-editor .criterion-editor',
      '.rubric-reuse-panel',
    ]) expect(css).toContain(selector);
    expect(css).toContain('.assignments-search:focus-within');
    expect(css).toContain('.rubric-reuse-item:focus-within');
    expect(css).toContain('@media (max-width: 720px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('var(--ds-color-brand-700)');
    expect(css).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it('keeps the created assignment form and rubric reuse controls wired to existing flows', () => {
    const creation = read('src/ui/components/AssignmentCreationPanel.tsx');
    const rubric = read('src/ui/components/RubricReusePanel.tsx');
    expect(creation).toContain('onCreate({ title: title.trim()');
    expect(rubric).toContain('previewReusableCriteria(source.rubric, rubric)');
    expect(rubric).toContain('onReuse(criteria)');
  });
});
