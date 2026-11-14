import { describe, expect, it } from 'vitest';
import { biologyCampaignIssues, customCampaignIssues, diagramCampaignIssues } from '../../src/domain/evaluationCampaignIssues.ts';
import { buildEvaluationIssueReport, countedUsableBiologyGrades, failureCategory } from '../../src/domain/evaluationIssueReport.ts';
import type { DiagramLabArchiveEntry } from '../../src/domain/diagramLabHistory.ts';
import type { BiologyRadarObservation } from '../../src/domain/biologyTeacherRadar.ts';
import type { ModelEvaluationRecord } from '../../src/domain/modelEvaluation.ts';

const diagram = (experiments: unknown[], state = 'finished'): DiagramLabArchiveEntry => ({
  state,
  report: { plannedRepetitions: 2, cases: [
    { caseId: 'E', experiments }, { caseId: 'D', experiments: [] },
  ] },
} as unknown as DiagramLabArchiveEntry);

const run = {
  caseId: 'E', repetition: 1, profileId: 'vision', profileName: 'Vision locale',
  model: 'qwen:4b', method: 'direct-image-generative',
};

const biology = (status: string, score: number | null, caseId = 'A'): BiologyRadarObservation => ({
  caseId, status, score, model: 'qwen:4b', method: 'direct-image-generative',
  protocol: 'standard', recordedAt: '2026-11-14T10:00:00Z', decisions: [],
} as unknown as BiologyRadarObservation);

describe('diagnostics des campagnes incompletes - confidentialite et fiabilite metier', () => {
  it('isole un echec scientifique, garde les compteurs utiles et recense les repetitions absentes', () => {
    const issues = diagramCampaignIssues(diagram([{
      ...run, status: 'failed', failureCategory: 'invalid-or-incomplete-output',
      diagnostics: { analysisCalls: 2, repairCalls: 1, outputFailure: 'missing-evidence',
        endpoint: 'https://secret.local', rawResponse: 'COPIE PRIVEE' },
      error: 'https://secret.local/COPIE PRIVEE',
    }]));
    expect(issues).toHaveLength(4);
    expect(issues[0]).toContain('Schéma E · répétition 1');
    expect(issues[0]).toContain('réponse du modèle invalide ou incomplète');
    expect(issues[0]).toContain('appels analyse : 2');
    expect(issues[0]).toContain('sortie : preuve manquante');
    expect(issues.filter((issue) => issue.includes('non enregistrée'))).toHaveLength(3);
    expect(issues.join(' ')).not.toMatch(/secret\.local|COPIE PRIVEE/);
  });

  it('ne fait pas passer une campagne encore en cours pour un echec definitif', () => {
    const issues = diagramCampaignIssues(diagram([{ ...run, status: 'success' }], 'running'));
    expect(issues).toHaveLength(3);
    expect(issues.every((issue) => issue.includes('pas encore enregistrée'))).toBe(true);
    expect(diagramCampaignIssues(diagram([]))).toEqual([
      'Aucun passage enregistré : campagne terminée sans résultat exploitable.',
    ]);
    expect(diagramCampaignIssues(diagram([], 'running'))).toEqual([
      'Aucun passage encore enregistré : campagne en cours.',
    ]);
  });

  it('neutralise les noms et compteurs fournis par des sorties non fiables', () => {
    const issues = diagramCampaignIssues(diagram([{
      ...run, model: 'https://private.example/secret', method: 'invalid@method',
      repetition: 999, status: 'failed', failureCategory: 'untrusted-private-error',
      diagnostics: { analysisCalls: -2, repairCalls: 100001, outputFailure: 'private/response' },
    }]));
    expect(issues[0]).toContain('répétition ?');
    expect(issues[0]).toContain('modèle non communiqué');
    expect(issues[0]).toContain('méthode non communiqué');
    expect(issues[0]).toContain('cause non enregistrée');
    expect(issues.join(' ')).not.toContain('private.example');
    expect(issues.join(' ')).not.toContain('100001');
  });

  it('distingue notes valides, zero reel, echec et note indisponible', () => {
    const records = [
      biology('success', 0, 'A'), biology('success', 10, 'B'),
      biology('success', NaN, 'C'), biology('success', 11, 'D'),
      biology('failed', 8, 'E'), biology('success', null, 'F'),
    ];
    expect(countedUsableBiologyGrades(records)).toBe(2);
    const issues = biologyCampaignIssues(records);
    expect(issues).toHaveLength(4);
    expect(issues.filter((issue) => issue.includes('note manquante ou invalide'))).toHaveLength(3);
    expect(issues.some((issue) => issue.includes('Schéma'))).toBe(false);
    expect(issues.some((issue) => issue.includes('Copie synthétique E') && issue.includes('échec'))).toBe(true);
  });

  it('rapporte les configurations non lancees sans exposer les erreurs brutes', () => {
    const record = {
      stage: 'vision',
      configurations: [
        { id: 'one', name: 'Vision locale', visionModel: 'qwen:4b' },
        { id: 'two', name: 'Fuite https://private.example', visionModel: 'https://private.example' },
      ],
      results: [{ profileId: 'one', status: 'failed', error: 'timeout https://private.example/secret' }],
    } as unknown as ModelEvaluationRecord;
    const issues = customCampaignIssues(record);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('Profil Vision locale · modèle qwen:4b · étape lecture · échec · Délai dépassé');
    expect(issues[1]).toContain('passage non enregistré');
    expect(issues.join(' ')).not.toContain('private.example');
    expect(customCampaignIssues({ stage: 'analysis', results: [], configurations: [] } as unknown as ModelEvaluationRecord))
      .toEqual(['Aucun passage enregistré pour ce test.']);
  });

  it('categorise les erreurs sans inserer des journaux ou URL de fournisseur', () => {
    expect(failureCategory('Modèle absent sur le serveur Ollama https://secret')).toBe('Modèle non installé');
    expect(failureCategory('Réponse du modèle incomplète ou invalide: contenu prive')).toBe('Résultat IA invalide');
    expect(failureCategory('JSON parse error: contenu prive')).toBe('Réponse JSON non exploitable');
    expect(failureCategory('HTTP 503 https://secret')).toBe('Erreur HTTP');
    expect(failureCategory('5 passages réussis, 2 essais échoués')).toBe('Certains passages ont échoué');
    expect(failureCategory('barème de Marie https://secret')).toBe('Échec de traitement (détails bruts non inclus)');
  });

  it('genere un bilan exploitable sans transcription, prompt ni identifiant non conforme', () => {
    const observations = [
      { ...biology('success', 0, 'E'), decisions: [{ id: 'p1', expected: 0 as const, awarded: 0 }, { id: 'p2', expected: 1 as const, awarded: null }] },
      { ...biology('failed', 10, 'D'), decisions: [{ id: 'p1', expected: 1 as const, awarded: null }] },
    ];
    const report = buildEvaluationIssueReport({
      journey: 'biology', status: 'partial', model: 'https://secret/private',
      campaignId: '../../secret', message: 'HTTP 500 https://secret/private',
      generatedAt: 'not-a-date', observations,
    });
    expect(report).toContain('Notes partiellement disponibles');
    expect(report).toContain('Notes exploitables : 1/2');
    expect(report).toContain('note : 0/10');
    expect(report).toContain('indéterminés : p2');
    expect(report).toContain('Date : inconnue');
    expect(report).toContain('Modèle : non communiqué');
    expect(report).toContain('Campagne : non communiqué');
    expect(report).not.toContain('https://secret');
    expect(report).not.toContain('../../secret');
    expect(report).toContain('Aucun contenu de copie');
  });

  it('limite les repetitions exportees, les anomalies et les compteurs inventes', () => {
    const observations = Array.from({ length: 32 }, () => biology('success', 0));
    const report = buildEvaluationIssueReport({
      journey: 'diagrams', status: 'failed', model: 'qwen:4b',
      campaignId: 'companion-scientific-diagram-fixture:2026-11-14T20:00:00.000Z',
      message: '4/6 passages réussis. details prives',
      observations,
      issues: Array.from({ length: 103 }, (_, index) => 'Anomalie ' + index),
      generatedAt: '2026-11-14T20:00:00.000Z',
    });
    expect(report).toContain('Passages scientifiques réussis : 4/6');
    expect(report).toContain('Notes exploitables : 32/32');
    expect(report.match(/· note : 0\/10/g)).toHaveLength(30);
    expect(report).toContain('... 3 autre(s) anomalie(s) non affichée(s).');
    expect(report).not.toContain('Anomalie 102');
    expect(report).not.toContain('details prives');
  });
});
