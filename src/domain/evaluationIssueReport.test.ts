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
      observations: [observation(null, { decisions: [{ id: 'p4', expected: 1, awarded: null }] }), observation(0, { caseId: 'G' })],
      stats: { successful: 1, total: 2 }, generatedAt: '2026-11-12T10:00:00Z',
    });
    expect(report).toContain('Notes exploitables : 1/2');
    expect(report).toContain('F · réussi · note : absente');
    expect(report).toContain('G · réussi · note : 0/10');
    expect(report).toContain('Notes partiellement disponibles');
    expect(report).toContain('indéterminés : p4');
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

  it('does not label an all-failed D1 radar test as a teacher interruption', () => {
    const report = buildEvaluationIssueReport({
      journey: 'diagrams', status: 'failed', model: 'D1',
      campaignId: 'companion-scientific-diagram-fixture-report:2026-11-12T13:08:41.154Z',
      message: '0/3 passages réussis. 3 en échec. Causes : API System One indisponible ou refusée : 3.',
      generatedAt: '2026-11-12T13:08:41.154Z',
    });
    expect(report).toContain('Type de problème : API System One indisponible ou incompatible');
    expect(report).toContain('Passages scientifiques réussis : 0/3');
    expect(report).toContain('Campagne : companion-scientific-diagram-fixture-report:2026-11-12T13:08:41.154Z');
    expect(report).not.toContain('Type de problème : Exécution interrompue');
  });

  it('keeps a failed-or-aborted batch distinct from an explicit stop', () => {
    expect(buildEvaluationIssueReport({
      journey: 'diagrams', status: 'failed',
      message: '0/3 passages réussis. Le protocole contient des essais échoués ou interrompus.',
    })).toContain('Type de problème : Certains passages ont échoué');
    expect(buildEvaluationIssueReport({
      journey: 'diagrams', status: 'failed', message: 'Traitement interrompu par l’enseignant.',
    })).toContain('Type de problème : Exécution interrompue');
  });

    it('classifies JSON parsing errors without exporting the raw model answer', () => {
    expect(buildEvaluationIssueReport({
      journey: 'custom', status: 'failed', message: 'Unexpected JSON response: PRIVATE PAYLOAD',
    })).toContain('Type de problème : Réponse JSON non exploitable');
  });
});
