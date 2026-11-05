import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('evaluation history session resilience', () => {
  const app=readFileSync('src/ui/App.tsx','utf8');
  it('adds runs to session history if IndexedDB still fails after quota fallback', () => {
    expect(app).toContain('setSavedModelEvaluations((current) => [record, ...current.filter');
    expect(app).toContain('setSessionOnlyEvaluationIds((current) => current.includes(record.id)');
    expect(app).toContain('Les résultats restent dans cette session');
  });
  it('allows comparing a recent saved or session-only D1 and TEV run without rerunning models', () => {
    expect(app).toContain('canCompareModelEvaluationRecords([record, savedRecord])');
    expect(app).toContain('setSuggestedEvaluationComparisonIds([previousComparable.id, savedRecord.id])');
    expect(app).toContain('setSelectedEvaluationHistoryIds(suggestedEvaluationComparisonIds)');
  });
  it('shows loss of original images and provides retry without a false durable save', () => {
    expect(app).toContain('session uniquement');
    expect(app).toContain('sans images originales');
    expect(app).toContain('Réessayer la sauvegarde');
    expect(app).toContain('setEvaluationWorkspaceStep(\'results\')');
  });
});
