import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Atelier pédagogique correction workspace', () => {
  it('loads the correction style last so semantic alerts remain visible', () => {
    const main = read('src/main.tsx');
    expect(main.indexOf('./ui/correctionAtelier.css')).toBeGreaterThan(main.indexOf('./ui/teacherAtelier.css'));
    expect(read('.storybook/preview.ts')).toContain('../src/ui/correctionAtelier.css');
  });

  it('uses only the search wrapper for the border and keyboard focus feedback', () => {
    const css = read('src/ui/correctionAtelier.css');
    const input = css.match(/\.copy-overview-search input\[type="search"\]\s*\{([^}]+)\}/)?.[1];
    const focusedInput = css.match(/\.copy-overview-search input\[type="search"\]:focus-visible\s*\{([^}]+)\}/)?.[1];
    const wrapperFocus = css.match(/\.copy-overview-search:focus-within\s*\{([^}]+)\}/)?.[1];

    expect(input).toContain('border: 0;');
    expect(input).toContain('box-shadow: none;');
    expect(focusedInput).toContain('box-shadow: none;');
    expect(wrapperFocus).toContain('border-color: var(--ds-color-brand-600)');
    expect(wrapperFocus).toContain('box-shadow: var(--ds-focus-ring)');
  });

  it('marks flagged criteria instead of styling every review criterion as a problem', () => {
    const app = read('src/ui/App.tsx');
    expect(app).toContain('isFlagged ? "panel review-card is-flagged" : "panel review-card"');
    const css = read('src/ui/correctionAtelier.css');
    expect(css).toContain('.review-main-column .review-card.is-flagged');
    const flagged = css.split('.review-main-column .review-card.is-flagged {')[1]?.split('}')[0] ?? '';
    expect(flagged).toContain('border-left: 3px solid var(--ds-color-warning)');
    expect(flagged).not.toContain('var(--ds-color-brand-700)');
    expect(css).toContain('.teacher-copy-rail-list button.is-active');
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

  it('uses Atelier paper and the informational progress state while preserving completion green', () => {
    const main = read('src/main.tsx');
    expect(main.indexOf('./ui/correctionAtelier.css')).toBeGreaterThan(main.indexOf('./ui/correctionFlow.css'));
    const css = read('src/ui/correctionAtelier.css');
    const source = css.match(/\.teacher-flow-shell \.analysis-progress,\s*\.live-copy-preview\s*\{([^}]+)\}/)?.[1];
    expect(source).toContain('background: var(--ds-color-surface)');
    expect(source).toContain('border-color: var(--ds-color-border)');
    expect(css).toContain('.teacher-flow-shell .analysis-progress .analysis-spinner');
    expect(css).toContain('border-top-color: var(--ds-color-progress)');
    expect(css).toContain('.teacher-flow-shell .teacher-progress-phase.current');
    const current = css.match(/\.teacher-flow-shell \.analysis-progress \.analysis-step\.current,\s*\.teacher-flow-shell \.teacher-progress-phase\.current\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(current).toContain('border-color: var(--ds-color-progress-border)');
    expect(current).toContain('background: var(--ds-color-progress-surface)');
    expect(current).not.toContain('var(--ds-color-brand-700)');
    expect(current).not.toContain('var(--ds-color-danger)');
    expect(css).toContain('.teacher-progress-phase.current > span');
    expect(css).toContain('background: var(--ds-color-progress)');
    expect(css).toContain('.copy-overview-grid > li.correction-series-card.is-preparing');
    expect(css).toContain('border-left: 3px solid var(--ds-color-progress)');
    expect(css).toContain('.teacher-progress-phase.complete > span');
    expect(css).toContain('color: var(--ds-color-success)');
  });

  it('separates active copy work, actionable warnings, success and real failures on cards', () => {
    const css = read('src/ui/correctionAtelier.css');
    expect(css).toContain('border-left: 3px solid var(--ds-color-progress)');
    expect(css).not.toContain('border-top: 3px solid var(--ds-color-brand-700)');
    expect(css).toContain('.correction-series-card.is-processing');
    expect(css).toContain('.grade-button[aria-busy="true"]:disabled');
    expect(css).toContain('border-left: 3px solid var(--ds-color-warning)');
    expect(css).toContain('border-left: 3px solid var(--ds-color-danger)');
    expect(css).toContain('.correction-series-card-status.is-to-review');
    expect(css).toContain('background: var(--ds-color-success-surface)');
    const layout = read('src/ui/atelierBLayout.css');
    expect(layout).toContain('.teacher-workspace-processing.is-active');
    expect(layout).toContain('color: var(--ds-color-progress)');
  });

  it('keeps legacy batch cards and live criteria consistent with the Atelier B status vocabulary', () => {
    const css = read('src/ui/correctionAtelier.css');
    const styles = (selector: string) => css.split(selector + ' {')[1]?.split('}')[0] ?? '';
    const batch = '.teacher-flow-shell .correction-series-list:not(.copy-overview-grid) > li.correction-series-card';
    expect(styles(batch)).toContain('var(--ds-color-border)');
    expect(styles(batch + '.is-processing')).toContain('border-left: 3px solid var(--ds-color-progress)');
    expect(styles(batch + '.is-needs-review')).toContain('border-left: 3px solid var(--ds-color-warning)');
    expect(styles(batch + '.is-failed')).toContain('border-left: 3px solid var(--ds-color-danger)');
    expect(styles('.teacher-flow-shell .review-card-pending.is-active')).toContain('var(--ds-color-progress-border)');
    expect(styles('.teacher-flow-shell .review-card-pending.is-active .review-pending-status')).toContain('var(--ds-color-progress)');
    expect(styles('.teacher-flow-shell .correction-series-progress-track > span')).toContain('var(--ds-color-progress)');
    expect(styles('.teacher-flow-shell .copy-overview-notice')).toContain('var(--ds-color-surface-subtle)');
    expect(css).not.toContain('.review-main-column .review-card.is-flagged {\n  border-left: 3px solid var(--ds-color-brand-700)');
  });

  it('places stopping beside the active copy instead of in the permanent application header', () => {
    const app = read('src/ui/App.tsx');
    const overview = read('src/ui/CorrectionOverview.tsx');
    const css = read('src/ui/correctionFlow.css');
    expect(app).not.toContain('global-stop-button');
    expect(app).toContain('Arrêter cette correction');
    expect(app).toContain('Arrêter les corrections');
    expect(overview).toContain('onStopCorrections');
    expect(css).toContain('var(--ds-color-border-strong)');
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
