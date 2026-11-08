import { describe, expect, it } from 'vitest';
import type { AiModelProfile } from './aiModelProfiles.ts';
import type { ModelEvaluationRecord, ModelEvaluationResultSnapshot } from './modelEvaluation.ts';
import { defaultAiModelConfiguration } from './aiModelProfiles.ts';
import { validateRubric } from './rubric.ts';
import {
  SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, buildScientificDiagramProtocolReport,
  availableDiagramMethods, selectDiagramMethods, diagramMethodIssue,
  diagramObservations, diagramProtocolProfileIssue, diagramTargetKey,
  parseScientificDiagramProtocolRubric, usesDirectDiagramVision,
} from './scientificDiagramProtocol.ts';

const profile = (analysisModel: string, method: 'generative' | 'decision' | 'visual-decision' = 'decision'): AiModelProfile => ({
  id: 'candidate', name: 'Candidat', mode: 'single', updatedAt: '2026-11-07T00:00:00Z',
  configuration: { ...defaultAiModelConfiguration, endpoint: 'http://localhost:11434',
    analysisModel, visionModel: 'qwen3.5:4b', correctionMethod: method },
});
const result = (status: 'success' | 'failed' = 'success'): ModelEvaluationResultSnapshot => ({
  profileId: 'candidate', profileName: 'Candidat', elapsedMs: 2500, readingMs: 0, analysisMs: 2500,
  tokens: 12, status, transcription: '', raw: 'PRIVATE_RAW', score: null,
  proposal: null, directVisualDecision: true,
  diagnosticRuns: [{
    kind: 'model', stage: 'analysis', model: 'd1:3b', promptId: 'decision.system-one-visual',
    requestMetadata: { provider: 'ollama', endpoint: 'https://SECRET_SERVER',
      stream: false, think: false, imageCount: 1, keepAlive: 0,
      options: { contextTokens: 2048, generationTokenLimit: 0 } },
    requestPayload: 'PRIVATE_BASE64_IMAGE',
    raw: JSON.stringify({ answers: {
      criterion_1_expected_1: { choice: 'present', probabilities: { present: 0.9 } },
      criterion_1_expected_2: { choice: 'absent', probabilities: { absent: 0.8 } },
    } }), elapsedMs: 2500, requestPrompt: 'PRIVATE_PROMPT',
  }],
});
function record(one: ModelEvaluationResultSnapshot = result()): ModelEvaluationRecord {
  return {
    id: 'diagram-1', completedAt: '2026-11-07T12:00:00Z',
    assignmentId: 'diagram', assignmentTitle: 'Dessin', question: 'Décrire',
    rubricSnapshot: SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, correctionMode: 'integrated',
    images: [{ mimeType: 'image/png', base64: 'PRIVATE_BASE64_IMAGE' }],
    subjectImages: [], subjectTranscription: null,
    configurations: [{
      id: 'candidate', name: 'Candidat', endpoint: 'https://SECRET_SERVER', apiKey: 'PRIVATE_API_KEY',
      visionModel: 'qwen3.5:4b', analysisModel: 'd1:3b', thinking: false,
      correctionMethod: 'decision', directVisualDecision: true,
    }],
    results: [one], stage: 'integrated',
  };
}

describe('protocole de schémas scientifiques', () => {
  it('conserves les 15 attendus observables et les 8 points exacts du barème professeur', () => {
    const rubric = SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC;
    expect(validateRubric(rubric)).toMatchObject({ valid: true, maximumPoints: 8 });
    expect(rubric.criteria.map(({ title, maxPoints }) => [title, maxPoints])).toEqual([
      ['Qualité du dessin', 4], ['Titre', 2], ['légendes', 2],
    ]);
    expect(rubric.criteria.flatMap((item) => item.subcriteria ?? [])).toHaveLength(15);
    expect(rubric.criteria.every((item) => item.analysisMode === 'scientific-diagram')).toBe(true);
  });
  it('importe le JSON historique, exclut la compréhension non détaillée et ne modifie pas l’original', () => {
    const source = {
      format: 'companion-correcteur-rubric', rubricTitle: 'Barème à définir',
      criteria: [
        { id: 'a', title: 'Qualité du dessin', maxPoints: 1, subcriteria: [
          { id: 'a-1', title: 'Centré', maxPoints: 1 },
        ] },
        { id: 'b', title: 'Compréhension', maxPoints: 2, description: 'Mitose' },
      ],
    };
    const result = parseScientificDiagramProtocolRubric(source);
    expect(result.title).toBe('Barème à définir');
    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0]?.analysisMode).toBe('scientific-diagram');
    expect(result.criteria[0]?.subcriteria?.[0]?.description).toBe('');
    expect(source.criteria).toHaveLength(2);
    expect(validateRubric(result).valid).toBe(true);
  });
  it('ne déduit aucune pondération et rejette une compréhension non découpée', () => {
    expect(() => parseScientificDiagramProtocolRubric({ title: 'Essai', criteria: [
      { id: 'a', title: 'Structures biologiques', maxPoints: 2, subcriteria: [] },
    ] })).toThrow('sous-critères');
    expect(() => parseScientificDiagramProtocolRubric({ title: 'Essai', criteria: [
      { id: 'a', title: 'Structures', maxPoints: 2, subcriteria: [{ id: 'a-1', title: 'Noyau', maxPoints: 1 }] },
    ] })).toThrow('totalisent');
    expect(() => parseScientificDiagramProtocolRubric({ title: 'Essai', criteria: [
      { id: 'a', title: 'Structures', maxPoints: '2', subcriteria: [] },
    ] })).toThrow('points');
  });
  it('réserve la décision image native à D1/D3 et n’invente pas de vision TEV1', () => {
    expect(usesDirectDiagramVision(profile('d1:3b'))).toBe(true);
    expect(usesDirectDiagramVision(profile('d3:4b'))).toBe(true);
    expect(usesDirectDiagramVision(profile('clef-flash', 'visual-decision'))).toBe(true);
    expect(usesDirectDiagramVision(profile('tev1:4b', 'visual-decision'))).toBe(false);
    expect(diagramProtocolProfileIssue(profile('tev1:4b', 'visual-decision'))).toContain('TEV1');
    expect(usesDirectDiagramVision(profile('tev1:4b'))).toBe(false);
    expect(usesDirectDiagramVision(profile('qwen3.5:4b', 'generative'))).toBe(false);
    expect(diagramProtocolProfileIssue({ ...profile('tev1:4b'),
      configuration: { ...profile('tev1:4b').configuration, visionModel: '' } })).toContain('Vision');
    expect(diagramProtocolProfileIssue({ ...profile('d1:3b'),
      configuration: { ...profile('d1:3b').configuration, visionModel: '' } })).toBeNull();
    expect(diagramProtocolProfileIssue({ ...profile('d1:3b'),
      configuration: { ...profile('d1:3b').configuration, apiCompatible: true } })).toContain('System One');
    expect(diagramProtocolProfileIssue({ ...profile('clef-flash', 'visual-decision'),
      configuration: { ...profile('clef-flash', 'visual-decision').configuration, visionModel: '' } })).toBeNull();
  });
  it('propose uniquement les méthodes réellement compatibles avec chaque profil', () => {
    const generative = profile('qwen3.5:9b', 'generative');
    expect(availableDiagramMethods(generative)).toEqual(['vision-then-analysis', 'direct-image-generative']);
    expect(selectDiagramMethods(generative, 'direct-image-generative')).toEqual(['direct-image-generative']);
    expect(diagramMethodIssue(generative, 'direct-image-systemone')).toContain('System One');

    const remote = { ...generative, configuration: { ...generative.configuration,
      endpoint: 'https://ai.example/v1/chat/completions', apiCompatible: true } };
    expect(selectDiagramMethods(remote, 'compare')).toEqual(['vision-then-analysis', 'direct-image-generative']);
    expect(diagramMethodIssue(remote, 'compare')).toBeNull();

    const d1 = profile('d1:3b');
    expect(selectDiagramMethods(d1, 'compare')).toEqual(['vision-then-analysis', 'direct-image-systemone']);
    expect(selectDiagramMethods(profile('tev1:4b'), 'compare')).toEqual(['vision-then-analysis']);
    expect(diagramMethodIssue(profile('tev1:4b'), 'direct-image-systemone')).toContain('TEV1');
    expect(selectDiagramMethods(profile('clef-flash', 'visual-decision'), 'compare')).toEqual(['vision-then-analysis', 'direct-image-systemone']);
    const withoutVision = { ...d1, configuration: { ...d1.configuration, visionModel: '' } };
    expect(selectDiagramMethods(withoutVision, 'compare')).toEqual(['direct-image-systemone']);
  });

  it('sépare les mesures des méthodes du même profil sans exporter de secret', () => {
    const twoStep = { ...record({ ...result(), directVisualDecision: false, diagnosticRuns: [] }),
      configurations: [{ ...record().configurations[0]!, directVisualDecision: false }] };
    const directGenerative = { ...record({ ...result(), directVisualDecision: false, diagnosticRuns: [] }),
      configurations: [{ ...record().configurations[0]!, directVisualDecision: false, directGenerativeVision: true }] };
    const directDecision = record();
    const report = buildScientificDiagramProtocolReport([
      { repetition: 1, record: twoStep }, { repetition: 1, record: directGenerative },
      { repetition: 1, record: directDecision },
    ], SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, {}, 1, 'test', 1);
    expect(report.summaries.map((summary) => summary.method)).toEqual([
      'vision-then-analysis', 'direct-image-generative', 'direct-image-systemone',
    ]);
    expect(report.summaries.every((summary) => summary.runsCompleted === 1)).toBe(true);
    expect(JSON.stringify(report)).not.toContain('PRIVATE_BASE64_IMAGE');
    expect(JSON.stringify(report)).not.toContain('PRIVATE_API_KEY');
  });

  it('lit les décisions visuelles sans déduire absent lorsque le modèle ne répond pas', () => {
    const observations = diagramObservations(result(), SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC);
    expect(observations).toHaveLength(15);
    expect(observations[0]).toMatchObject({ choice: 'present', probability: 0.9 });
    expect(observations[1]).toMatchObject({ choice: 'absent', probability: 0.8 });
    expect(observations[2]).toMatchObject({ choice: 'uncertain', probability: null });
    expect(diagramObservations(result('failed'), SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC)
      .every((item) => item.choice === 'uncertain')).toBe(true);
  });
  it('mesure la stabilité séparément de la justesse et exclut les images et secrets du rapport', () => {
    const gold = { [diagramTargetKey('drawing', 'drawing-page')]: 'present' as const,
      [diagramTargetKey('drawing', 'drawing-centered')]: 'present' as const };
    const report = buildScientificDiagramProtocolReport(
      [1, 2, 3].map((repetition) => ({ repetition, record: record() })),
      SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, gold, 3, '2026-11-07T12:00:00Z', 1,
    );
    expect(report.summaries[0]).toMatchObject({
      runsCompleted: 3, complete: true, accuracyPercent: 50,
      stableResolvedTargets: 2, labelledTargets: 2, coveragePercent: 13.3,
    });
    const exported = JSON.stringify(report);
    for (const secret of ['PRIVATE_BASE64_IMAGE', 'PRIVATE_API_KEY', 'SECRET_SERVER', 'PRIVATE_RAW', 'PRIVATE_PROMPT']) {
      expect(exported).not.toContain(secret);
    }
    expect(report.experiments).toHaveLength(3);
    const noGold = buildScientificDiagramProtocolReport(
      [{ repetition: 1, record: record() }], SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, {}, 3, 'today', 1,
    );
    expect(noGold.summaries[0]).toMatchObject({ complete: false, accuracyPercent: null, stableResolvedTargets: null });
  });
  it('récupère les choix natifs TEV1 sur transcription même si le modèle ne peut attribuer une note', () => {
    const base = result();
    const textRun: ModelEvaluationResultSnapshot = {
      ...base, directVisualDecision: false, score: null, proposal: null,
      transcription: 'Mitose végétale, schéma sur feuille.',
      diagnosticRuns: [{
        ...base.diagnosticRuns![0]!,
        promptId: 'decision.system-one',
        requestMetadata: { ...base.diagnosticRuns![0]!.requestMetadata!, imageCount: 0 },
        raw: JSON.stringify({ answers: {
          criterion_1_expected_1: { choice: 'present', probabilities: { present: 0.82 } },
          criterion_1_expected_2: { choice: 'partial', probabilities: { partial: 0.61 } },
          criterion_2_expected_1: { choice: 'absent', probabilities: { absent: 0.97 } },
          criterion_3_expected_1: { choice: 'uncertain', probabilities: { uncertain: 0.95 } },
        } }),
      }],
    };
    const observations = diagramObservations(textRun, SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC);
    expect(observations).toHaveLength(15);
    expect(observations[0]).toMatchObject({ choice: 'present', decisionSource: 'native-text', probability: 0.82 });
    expect(observations[1]).toMatchObject({ choice: 'partial', decisionSource: 'native-text', probability: 0.61 });
    expect(observations[6]).toMatchObject({ choice: 'absent', decisionSource: 'native-text' });
    expect(observations[12]).toMatchObject({ choice: 'uncertain', decisionSource: 'native-text' });
    expect(observations[2]).toMatchObject({ choice: 'uncertain', decisionSource: 'none' });
    const gold = { [diagramTargetKey('drawing', 'drawing-page')]: 'present' as const };
    const report = buildScientificDiagramProtocolReport(
      [{ repetition: 1, record: record(textRun) }],
      SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, gold, 1, 'test', 1,
    );
    expect(report.experiments[0]).toMatchObject({
      method: 'vision-then-analysis', scoreStatus: 'invalid-or-incomplete-proposal', score: null,
    });
    expect(report.summaries[0]).toMatchObject({
      successfulRuns: 1, scoredRuns: 0, unscoredRuns: 1,
      resolvedDecisions: 3, totalDecisions: 15,
      coveragePercent: 20, accuracyPercent: 100,
      stableResolvedTargets: null,
    });
    expect(report.summaries[0]?.decisions[0]?.stable).toBe(false);
    expect(JSON.stringify(report)).not.toContain('PRIVATE_BASE64_IMAGE');
  });

  it('n’affiche pas une fausse exactitude de 0 % quand aucun choix n’est récupéré', () => {
    const noDecisions: ModelEvaluationResultSnapshot = {
      ...result(), directVisualDecision: false, diagnosticRuns: [], proposal: null,
    };
    const gold = { [diagramTargetKey('drawing', 'drawing-page')]: 'present' as const };
    const report = buildScientificDiagramProtocolReport(
      [{ repetition: 1, record: record(noDecisions) }],
      SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, gold, 1, 'test', 1,
    );
    expect(report.summaries[0]).toMatchObject({
      complete: true, scoredRuns: 0, unscoredRuns: 1, resolvedDecisions: 0,
      accuracyPercent: null, coveragePercent: 0, stableResolvedTargets: null,
    });
    expect(report.summaries[0]?.decisions.every((decision) => !decision.stable)).toBe(true);
  });

  it('distingue un échec avant analyse sans exporter ses éventuels secrets', () => {
    const failed: ModelEvaluationResultSnapshot = {
      ...result('failed'), error: 'https://PRIVATE_ENDPOINT?apiKey=PRIVATE_API_KEY',
      readingMs: 0, analysisMs: 0, diagnosticRuns: [],
    };
    const report = buildScientificDiagramProtocolReport(
      [{ repetition: 1, record: record(failed) }],
      SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, {}, 1, 'test', 1,
    );
    expect(report.summaries[0]).toMatchObject({
      successfulRuns: 0, failedRuns: 1, resolvedDecisions: 0, accuracyPercent: null,
    });
    expect(report.experiments[0]?.error).toContain('avant traitement');
    expect(report.experiments[0]?.failureCategory).toBe('other');
    expect(JSON.stringify(report)).not.toContain('PRIVATE_ENDPOINT');
    expect(JSON.stringify(report)).not.toContain('PRIVATE_API_KEY');
  });
});
