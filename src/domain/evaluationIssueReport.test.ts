import { describe, expect, it } from 'vitest';
import type { BiologyRadarObservation } from './biologyTeacherRadar.ts';
import { buildEvaluationIssueReport, countedUsableBiologyGrades } from './evaluationIssueReport.ts';

const observation = (score: number | null, extra: Partial<BiologyRadarObservation> = {}): BiologyRadarObservation => ({
  id: 'obs-1', profileId: 'p', profile: 'Gemma', model: 'gemma4:e4b',
  provider: 'ollama', method: 'generative', protocol: 'contract',
  caseId: 'F', recordedAt: '2026-11-12T10:00:00Z', status: 'success',
  score, referenceScore: 7, decisions: [], ...extra,
});

describe('evaluation issue report', () => {
  it('counts real zero grades but flags successful calls with no grade', () => {
    expect(countedUsableBiologyGrades([observation(0), observation(null), observation(7), observation(12)])).toBe(2);
  });

  it('exports useful missing-score diagnostics without inventing a student zero', () => {
    const report = buildEvaluationIssueReport({
      journey: 'biology', status: 'Résultats partiels', model: 'gemma4:e4b',
      campaignId: 'biology-123', message: 'Aucun résultat exploitable pour cette tentative.',
      observations: [observation(null), observation(0, { caseId: 'G' })],
      stats: { successful: 1, total: 2 }, generatedAt: '2026-11-12T10:00:00Z',
    });
    expect(report).toContain('Notes exploitables : 1/2');
    expect(report).toContain('F · réussi · note : absente');
    expect(report).toContain('G · réussi · note : 0/10');
    expect(report).toContain('Aucun résultat exploitable');
    expect(report).toContain('Campagne : biology-123');
  });

  it('does not expose raw errors, student text, server URL or arbitrary identifiers', () => {
    const report = buildEvaluationIssueReport({
      journey: 'biology', status: 'failed',
      model: 'https://private-llm.example/SECRET',
      campaignId: 'PRIVATE/STUDENT/SECRET',
      message: 'Erreur de notation, secret réponse : jane@example.com https://server/SECRET',
      observations: [observation(null, {
        model: 'https://private-llm.example/SECRET',
        caseId: 'PRIVATE-STUDENT-SECRET',
        status: 'failed, private content',
      })],
      generatedAt: '2026-11-12T10:00:00Z',
    });
    expect(report).not.toMatch(/SECRET|private-llm|jane@example|https:\/\/|PRIVATE|STUDENT/);
    expect(report).toContain('non communiqué');
    expect(report).toContain('Échec de traitement');
  });

  it('classifies JSON parsing errors without exporting the raw model answer', () => {
    expect(buildEvaluationIssueReport({
      journey: 'custom', status: 'failed', message: 'Unexpected JSON response: PRIVATE PAYLOAD',
    })).toContain('Type de problème : Réponse JSON non exploitable');
  });
});
