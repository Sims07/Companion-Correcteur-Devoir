import { describe, expect, it } from 'vitest';
import type { DiagramLabArchiveEntry } from './diagramLabHistory.ts';
import type { ModelEvaluationRecord } from './modelEvaluation.ts';
import type { BiologyRadarObservation } from './biologyTeacherRadar.ts';
import { biologyCampaignIssues, customCampaignIssues, diagramCampaignIssues } from './evaluationCampaignIssues.ts';
import { buildEvaluationIssueReport } from './evaluationIssueReport.ts';

function archive(experiments: unknown[], state: 'running' | 'finished' = 'finished'): DiagramLabArchiveEntry {
  return {
    id: 'fixture-campaign', createdAt: '2026-11-13T12:00:00Z', state,
    report: {
      format: 'companion-scientific-diagram-fixture-report',
      plannedRepetitions: 2,
      cases: [
        { caseId: 'A', experiments },
        { caseId: 'B', experiments: [] },
      ],
    },
  } as unknown as DiagramLabArchiveEntry;
}
const good = { profileId: 'profile-1', profileName: 'Qwen', model: 'qwen3.5:4b', method: 'vision-then-analysis', repetition: 1, status: 'success' };
const failed = {
  ...good, repetition: 2, status: 'failed', failureCategory: 'invalid-or-incomplete-output',
  error: 'PRIVATE ANSWER student@example.com https://internal.example/token',
  diagnostics: { analysisCalls: 3, repairCalls: 2, generationLimitHits: 1, outputFailure: 'invalid-points',
    raw: 'student@example.com', endpoint: 'https://internal.example/token' },
};

describe('targeted campaign issue export', () => {
  it('lists the exact failed case, method and repetition, plus missing slots', () => {
    const issues = diagramCampaignIssues(archive([good, failed]));
    expect(issues).toHaveLength(3);
    expect(issues[0]).toContain('Schéma A · répétition 2 · modèle qwen3.5:4b');
    expect(issues[0]).toContain('réponse du modèle invalide ou incomplète');
    expect(issues[0]).toContain('relances de format : 2');
    expect(issues[0]).toContain('sortie : points invalides');
    expect(issues[1]).toContain('Schéma B · répétition 1');
    expect(issues[2]).toContain('Schéma B · répétition 2');
    const report = buildEvaluationIssueReport({
      journey: 'diagrams', status: 'Incomplète', issues, stats: { successful: 1, total: 2 },
    });
    expect(report).toContain('Anomalies ciblées : 3');
    expect(report).not.toMatch(/PRIVATE ANSWER|student@example|internal\.example|token|https:\/\//);
  });

  it('marks in-progress repetitions as provisional rather than finished failures', () => {
    const ongoing = diagramCampaignIssues(archive([good], 'running'));
    expect(ongoing).toHaveLength(3);
    expect(ongoing.every((issue) => issue.includes('campagne en cours'))).toBe(true);
    const finished = diagramCampaignIssues(archive([good], 'finished'));
    expect(finished).toHaveLength(3);
    expect(finished.every((issue) => issue.includes('non enregistrée'))).toBe(true);
  });

  it('reports a finished campaign without any recorded run', () => {
    expect(diagramCampaignIssues(archive([]))).toEqual([
      'Aucun passage enregistré : campagne terminée sans résultat exploitable.',
    ]);
  });

  it('distinguishes a genuine interruption from failed model output and never echoes unknown categories', () => {
    const issues = diagramCampaignIssues(archive([{ ...failed, status: 'cancelled', failureCategory: 'SECRET',
      diagnostics: { analysisCalls: 99999999999, outputFailure: 'private payload' } }]));
    expect(issues[0]).toContain('interrompu');
    expect(issues[0]).toContain('cause non enregistrée');
    expect(issues[0]).not.toContain('SECRET');
    expect(issues[0]).not.toContain('private payload');
  });

  it('reports missing biology grades but preserves a real zero', () => {
    const make = (caseId: string, score: number | null, status = 'success') => ({
      caseId, score, status, model: 'qwen3.5:4b', protocol: 'contract', method: 'generative',
    }) as BiologyRadarObservation;
    const issues = biologyCampaignIssues([make('F', null), make('G', 0), make('A', null, 'failed')]);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('Copie synthétique F');
    expect(issues[0]).toContain('note manquante ou invalide');
    expect(issues[1]).toContain('échec');
    expect(issues.join(' ')).not.toContain('Copie synthétique G');
  });

  it('reports custom failed and never-started configurations without exposing their endpoints or error bodies', () => {
    const record = {
      stage: 'analysis',
      configurations: [
        { id: 'one', name: 'Ollama', analysisModel: 'qwen3.5:4b', endpoint: 'https://secret.example' },
        { id: 'two', name: 'Autre', analysisModel: 'gemma4:e4b' },
      ],
      results: [{ profileId: 'one', status: 'failed', error: 'PRIVATE STUDENT RESPONSE' }],
      images: [{ base64: 'SECRETCOPY' }], question: 'PRIVATE STUDENT QUESTION',
    } as unknown as ModelEvaluationRecord;
    const issues = customCampaignIssues(record);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('échec');
    expect(issues[0]).toContain('Échec de traitement');
    expect(issues[1]).toContain('passage non enregistré');
    expect(issues.join(' ')).not.toMatch(/PRIVATE|SECRET|secret\.example/);
  });
});
