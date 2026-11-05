import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('model evaluation local history resilience UI', () => {
  const app=readFileSync('src/ui/App.tsx','utf8');
  const style=readFileSync('src/ui/modelEvaluationWorkspace.css','utf8');

  it('retains all completed model results in session even when IndexedDB cannot persist', () => {
    expect(app).toContain('await saveModelEvaluationWithFallback(savedRecord, evaluationService.save)');
    expect(app).toContain('setEvaluationSessionOnlyIds((current) => [...current, savedRecord.id])');
    expect(app).toContain('setSavedModelEvaluations((current) => [recordForHistory');
    expect(app).toContain('explainModelEvaluationStorageError(cause)');
  });

  it('automatically opens Results after execution and provides comparison of two compatible experiments', () => {
    expect(app).toContain("setEvaluationWorkspaceStep('results');");
    expect(app).toContain('canCompareModelEvaluationRecords([record, savedRecord])');
    expect(app).toContain('Comparer les deux essais');
    expect(app).toContain('setSelectedEvaluationHistoryIds(evaluationSuggestedComparison)');
  });

  it('marks session-only or compact archives, supports retry, and avoids silently restoring absent images', () => {
    expect(app).toContain('session uniquement');
    expect(app).toContain('sans images originales');
    expect(app).toContain('Réessayer la sauvegarde');
    expect(app).toContain('Réimportez la copie');
    expect(style).toContain('.evaluation-workspace-shell .evaluation-archive-notice');
    expect(style).toContain('var(--ds-color-border-strong)');
  });
});
