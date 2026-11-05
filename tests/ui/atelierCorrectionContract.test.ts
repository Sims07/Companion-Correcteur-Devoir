import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Atelier pédagogique correction workspace', () => {
  it('loads the correction style last so semantic alerts remain visible', () => {
    const main = read('src/main.tsx');
    expect(main.indexOf('./ui/correctionAtelier.css')).toBeGreaterThan(main.indexOf('./ui/teacherAtelier.css'));
    expect(read('.storybook/preview.ts')).toContain('../src/ui/correctionAtelier.css');
  });

  it('marks flagged criteria instead of styling every review criterion as a problem', () => {
    const app = read('src/ui/App.tsx');
    expect(app).toContain('isFlagged ? "panel review-card is-flagged" : "panel review-card"');
    const css = read('src/ui/correctionAtelier.css');
    expect(css).toContain('.review-main-column .review-card.is-flagged');
    expect(css).not.toContain('.review-main-column .review-card:not(.is-flagged)');
  });

  it('keeps evidence beside decisions on desktop and stacks panels on smaller devices', () => {
    const css = read('src/ui/correctionAtelier.css');
    expect(css).toContain('grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr)');
    expect(css).toContain('.review-source-pages .live-copy-page img');
    expect(css).toContain('@media (max-width: 1100px)');
    expect(css).toContain('.review-source-pane { position: static; max-height: none; }');
    expect(css).toContain('.review-card:focus-visible');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('var(--ds-color-warning-surface)');
    expect(css).toContain('var(--ds-color-brand-700)');
  });

  it('preserves all existing evidence, note adjustments and teacher comments', () => {
    const app = read('src/ui/App.tsx');
    expect(app).toContain('<TeacherReviewAlert');
    expect(app).toContain('<details className="review-explanation">');
    expect(app).toContain('className="comment-field"');
    expect(app).toContain('normalizeGradeScore(Number(event.target.value))');
    expect(read('src/ui/components/TeacherReviewAlert.tsx')).toContain('Copier le commentaire');
  });
});
