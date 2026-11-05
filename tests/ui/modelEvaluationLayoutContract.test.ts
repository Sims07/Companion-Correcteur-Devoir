import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Model evaluation workspace layout contract', () => {
  const main = readFileSync('src/main.tsx', 'utf8');
  const legacy = readFileSync('src/ui/styles.css', 'utf8');
  const layout = readFileSync('src/ui/modelEvaluationWorkspace.css', 'utf8');
  const app = readFileSync('src/ui/App.tsx', 'utf8');

  it('loads one dedicated layout after legacy styles and removes the floating sidebar', () => {
    expect(main).toContain("import './ui/modelEvaluationWorkspace.css';");
    expect(main.indexOf("import './ui/modelEvaluationWorkspace.css';"))
      .toBeGreaterThan(main.indexOf("import './ui/aiToolsAtelier.css';"));
    expect(legacy).not.toMatch(/\.evaluation-step-nav\s*\{float:left/);
    expect(legacy).not.toMatch(/\.evaluation-config-workspace,\.evaluation-results-workspace\s*\{margin-left:248px/);
    expect(layout).toContain('.evaluation-workspace-shell .evaluation-step-nav');
    expect(layout).toContain('float: none');
    expect(layout).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(layout).toContain('.evaluation-workspace-shell .diagnostic-content-column > *');
    expect(layout).toContain('grid-template-columns: minmax(0, 1fr)');
  });

  it('places the experiment launch after the rubric and source copy and keeps analysis-only free of image upload', () => {
    expect(app).not.toContain('evaluation-sidebar-label');
    const rubric = app.indexOf('id={interfaceMode === \'diagnostic\' ? \'evaluation-rubric\'');
    const copy = app.indexOf('id={interfaceMode === \'diagnostic\' ? \'evaluation-copy\'');
    const launch = app.indexOf('className="evaluation-launch-panel"');
    const results = app.indexOf('id="evaluation-results"');
    expect(rubric).toBeGreaterThan(0);
    expect(copy).toBeGreaterThan(rubric);
    expect(launch).toBeGreaterThan(copy);
    expect(results).toBeGreaterThan(launch);
    expect(app).toContain("evaluationWorkspaceStep === 'configuration' && evaluationStageMode !== 'analysis'");
    expect(app).toContain('aria-label="Lancer l’expérience"');
  });

  it('opens results before the history write and offers a retry if IndexedDB fails', () => {
    const finished = app.indexOf('setModelEvaluationResults(results);');
    const navigation = app.indexOf("if (results.length > 0) setEvaluationWorkspaceStep('results');", finished);
    const persistence = app.indexOf('await persistModelEvaluationRecord(savedRecord);', finished);
    expect(finished).toBeGreaterThan(0);
    expect(navigation).toBeGreaterThan(finished);
    expect(persistence).toBeGreaterThan(navigation);
    expect(app).toContain('Réessayer la sauvegarde');
    expect(app).toContain("evaluationArchiveStatus === 'failed'");
    expect(app).not.toContain('Les résultats sont disponibles dans cette session, mais leur sauvegarde dans l’historique local a échoué.');
  });

  it('overrides the remaining green evaluation surfaces with palette B tokens', () => {
    expect(layout).toContain('.evaluation-run-actions:not(.evaluation-config-launch)');
    expect(layout).toContain('.evaluation-progress-counter');
    expect(layout).toContain('.evaluation-configuration-step.is-complete');
    expect(layout).toContain('.evaluation-archive-feedback');
    expect(layout).toContain('var(--ds-color-brand-700)');
    expect(layout).toContain('var(--ds-color-success-surface)');
  });

  it('uses shared design tokens and defines tablet, mobile and reduced-motion behavior', () => {
    expect(layout).toContain('var(--ds-color-surface)');
    expect(layout).toContain('var(--ds-color-border)');
    expect(layout).toContain('var(--ds-color-brand-700)');
    expect(layout).toContain('@media (max-width: 1050px)');
    expect(layout).toContain('@media (max-width: 760px)');
    expect(layout).toContain('@media (max-width: 520px)');
    expect(layout).toContain('prefers-reduced-motion: reduce');
  });
});
