import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Atelier B rubric composition', () => {
  const app = read('src/ui/App.tsx');
  const css = read('src/ui/atelierBRubric.css');

  it('renders live rubric totals and validation state in a separate summary', () => {
    expect(app).toContain('className="atelier-rubric-synthesis"');
    expect(app).toContain('aria-label="Synthèse du barème"');
    expect(app).toContain("validation.valid ? 'Un barème prêt à corriger' : 'Un barème à compléter'");
    expect(app).toContain('{rubric.criteria.length} critère');
    expect(app).toContain("{validation.maximumPoints.toLocaleString('fr-FR')} points");
    expect(app).toContain("validation.valid ? 'atelier-rubric-synthesis-status is-ready'");
  });

  it('numbers the actual criteria, preserving their edit controls and compact details', () => {
    expect(app).toContain('rubric.criteria.map((criterion, criterionIndex)');
    expect(app).toContain('className="atelier-criterion-index"');
    expect(app).toContain("String(criterionIndex + 1).padStart(2,");
    expect(app).toContain('className="criterion-editor-content"');
    expect(css).toContain('.atelier-rubric-editor .criterion-editor-summary');
    expect(css).toContain('.atelier-rubric-editor .criterion-editor-content');
    expect(app).toContain('useState<string | null>(null)');
    expect(css).toContain('.atelier-rubric-editor > .rubric-import-panel { order: 7');
    expect(css).toContain('.rubric-editor-toolbar .validation.valid');
    expect(css).toContain('.rubric-actions .validation.valid');
  });

  it('shows active rubric extraction in progress colour and completed steps in success colour', () => {
    const active = css.split('.rubric-import-step.is-active {')[1]?.split('}')[0] ?? '';
    const done = css.split('.rubric-import-step.is-complete .rubric-import-step-number {')[1]?.split('}')[0] ?? '';
    expect(active).toContain('var(--ds-color-progress-border)');
    expect(active).toContain('var(--ds-color-progress-surface)');
    expect(active).not.toContain('var(--ds-color-brand-700)');
    expect(done).toContain('var(--ds-color-success)');
    expect(css).toContain('.rubric-import-step.is-active .rubric-import-step-number');
  });

  it('keeps diagnostic settings unchanged and the teacher layout responsive', () => {
    expect(app).toContain('atelier-rubric-grid is-diagnostic');
    expect(css).toContain('.atelier-rubric-grid.is-diagnostic { display: block; }');
    expect(css).toContain('@media (max-width: 1200px)');
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('focus-visible');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('body:has(.atelier-rubric-grid:not(.is-diagnostic)) .memory-fab');
    expect(read('src/main.tsx')).toContain("import './ui/atelierBRubric.css'");
  });

  it('preserves optional reuse of source criteria without changing linked assignments', () => {
    expect(css).toContain(".atelier-rubric-reuse-hint button");
    expect(app).toContain('<RubricReusePanel');
    expect(app).toContain('panel.open = true');
    expect(app).toContain('onReuse={(criteria)');
  });
});
