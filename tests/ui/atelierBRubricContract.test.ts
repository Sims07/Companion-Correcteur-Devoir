import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Atelier B rubric composition', () => {
  const app = read('src/ui/App.tsx');
  const css = read('src/ui/atelierBRubric.css');

  it('renders the teacher's live rubric totals and validation state in a separate summary', () => {
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
  });

  it('keeps diagnostic settings unchanged and the teacher layout responsive', () => {
    expect(app).toContain('atelier-rubric-grid is-diagnostic');
    expect(css).toContain('.atelier-rubric-grid.is-diagnostic { display: block; }');
    expect(css).toContain('@media (max-width: 1200px)');
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('focus-visible');
    expect(css).toContain('prefers-reduced-motion');
    expect(read('src/main.tsx')).toContain("import './ui/atelierBRubric.css'");
  });

  it('preserves optional reuse of source criteria without changing linked assignments', () => {
    expect(app).toContain('className="rubric-reuse-panel"').toBe(false);
    expect(app).toContain('<RubricReusePanel');
    expect(app).toContain('panel.open = true');
    expect(app).toContain('onReuse={(criteria)');
  });
});
