import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { ModelEvaluationRecord, ModelEvaluationResultSnapshot } from './modelEvaluation.ts';
import { diagramTargetKey } from './scientificDiagramProtocol.ts';
import { getRubricSubcriteria, validateRubric } from './rubric.ts';
import {
  SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC, SCIENTIFIC_DIAGRAM_FIXTURES,
  SCIENTIFIC_DIAGRAM_BASE_CASE_IDS, SCIENTIFIC_DIAGRAM_POINTER_CASE_IDS, SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET,
  buildScientificDiagramFixtureReport,
} from './scientificDiagramFixtures.ts';

function record(status: 'success' | 'failed' = 'success'): ModelEvaluationRecord {
  const result: ModelEvaluationResultSnapshot = {
    profileId: 'd1', profileName: 'D1', elapsedMs: 3200, readingMs: 0, analysisMs: 3200,
    tokens: null, status, transcription: '', raw: 'PRIVATE_RAW_RESPONSE',
    score: status === 'success' ? 10 : null, proposal: null, directVisualDecision: true,
    diagnosticRuns: [{
      kind: 'model', stage: 'analysis', model: 'd1:3b', promptId: 'decision.system-one-visual',
      requestPrompt: 'PRIVATE_EXAM_PROMPT',
      requestMetadata: { provider: 'ollama', endpoint: 'https://PRIVATE_ENDPOINT',
        stream: false, think: false, imageCount: 1, keepAlive: 0,
        options: { contextTokens: 4096, generationTokenLimit: 32 } },
      requestPayload: 'PRIVATE_BASE64_IMAGE', raw: JSON.stringify({ answers: {
        criterion_1_expected_1: { choice: 'present', probabilities: { present: 0.9 } },
      } }), elapsedMs: 3200,
    }],
  };
  return {
    id: 'test', completedAt: '2026-11-07T20:00:00Z',
    assignmentId: 'mitose', assignmentTitle: 'Mitose', question: 'Réalisez un dessin de mitose',
    rubricSnapshot: SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC, correctionMode: 'integrated',
    images: [{ base64: 'PRIVATE_BASE64_IMAGE', mimeType: 'image/webp' }],
    subjectImages: [], subjectTranscription: null,
    configurations: [{
      id: 'd1', name: 'D1', endpoint: 'https://PRIVATE_ENDPOINT',
      apiKey: 'PRIVATE_API_KEY', visionModel: 'qwen3.5:4b', analysisModel: 'd1:3b',
      thinking: false, correctionMethod: 'decision', directVisualDecision: true,
    }],
    results: [result], stage: 'integrated',
  };
}
describe('jeu de dessins scientifiques A/B/C et contrôle de flèches D/E', () => {
  it('conserve les quatre catégories du professeur et les 10 points explicitement détaillés', () => {
    expect(validateRubric(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC))
      .toMatchObject({ valid: true, maximumPoints: 10 });
    expect(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.map((c) => [c.title, c.maxPoints]))
      .toEqual([['Qualité du dessin', 4], ['Titre', 2], ['légendes', 2], ['Compréhension', 2]]);
    expect(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.at(-1)?.subcriteria?.map((s) => s.maxPoints))
      .toEqual([0.5, 0.5, 0.5, 0.5]);
  });
  it('couvre chaque sous-critère par une décision et un pointage sans interpolation ni arrondi caché', () => {
    const keys = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.flatMap((criterion) =>
      getRubricSubcriteria(criterion).map((sub) => diagramTargetKey(criterion.id, sub.id)));
    expect(keys).toHaveLength(19);
    expect(SCIENTIFIC_DIAGRAM_FIXTURES.map((fixture) => fixture.referenceScore)).toEqual([9.84, 7.36, 0.66, 9.34, 8.66]);
    expect(SCIENTIFIC_DIAGRAM_BASE_CASE_IDS).toEqual(['A', 'B', 'C']);
    expect(SCIENTIFIC_DIAGRAM_POINTER_CASE_IDS).toEqual(['D', 'E']);
    for (const fixture of SCIENTIFIC_DIAGRAM_FIXTURES) {
      expect(Object.keys(fixture.gold)).toEqual(keys);
      expect(Object.keys(fixture.referencePoints)).toEqual(keys);
      const sum = Object.values(fixture.referencePoints).reduce((total, points) => total + points, 0);
      expect(Math.round(sum * 100) / 100).toBe(fixture.referenceScore);
      for (const criterion of SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria) {
        for (const sub of getRubricSubcriteria(criterion)) {
          const key = diagramTargetKey(criterion.id, sub.id);
          const awarded = fixture.referencePoints[key]!;
          expect(awarded).toBeGreaterThanOrEqual(0);
          expect(awarded).toBeLessThanOrEqual(sub.maxPoints);
          expect(fixture.gold[key]).toBe(
            awarded === 0 ? 'absent' : awarded === sub.maxPoints ? 'present' : 'partial',
          );
        }
      }
    }
    expect(Object.values(SCIENTIFIC_DIAGRAM_FIXTURES[1]!.gold)).toContain('partial');
  });
  it('réévalue A : titre descriptif mais incomplet sur l’organe et l’organisme', () => {
    const excellent = SCIENTIFIC_DIAGRAM_FIXTURES.find((fixture) => fixture.id === 'A')!;
    const subject = diagramTargetKey('title', 'title-subject');
    const section = diagramTargetKey('title', 'title-section');
    expect(excellent.referenceScore).toBe(9.84);
    expect(excellent.referencePoints[subject]).toBe(0.17);
    expect(excellent.gold[subject]).toBe('partial');
    expect(excellent.referencePoints[section]).toBe(0.35);
    expect(excellent.referenceReview?.notes['title-subject']).toContain('organe');
    expect(Object.entries(excellent.referencePoints).filter(([key, points]) =>
      key !== subject && points !== SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria
        .flatMap(c => getRubricSubcriteria(c).map(sub => ({ key: diagramTargetKey(c.id, sub.id), maxPoints: sub.maxPoints })))
        .find(sub => sub.key === key)?.maxPoints)).toEqual([]);
  });
  it('réévalue C : titre horizontal et souligné, sans créditer son contenu incorrect', () => {
    const poor = SCIENTIFIC_DIAGRAM_FIXTURES.find((fixture) => fixture.id === 'C')!;
    const horizontal = diagramTargetKey('title', 'title-horizontal');
    const emphasis = diagramTargetKey('title', 'title-emphasis');
    const subject = diagramTargetKey('title', 'title-subject');
    expect(poor.referenceScore).toBe(0.66);
    for (const key of [horizontal, emphasis]) {
      expect(poor.referencePoints[key]).toBe(0.33);
      expect(poor.gold[key]).toBe('present');
    }
    expect(poor.referencePoints[subject]).toBe(0);
    expect(poor.gold[subject]).toBe('absent');
    expect(Object.entries(poor.referencePoints).filter(([key, score]) =>
      key !== horizontal && key !== emphasis && score !== 0)).toEqual([]);
    expect(poor.referenceReview?.notes['title-emphasis']).toContain('soulignement');
    const report = buildScientificDiagramFixtureReport([], 1, '2026-11-12T19:00:00Z');
    expect(report.cases.find((item) => item.caseId === 'C')).toMatchObject({
      referenceScore: 0.66,
      expectedPoints: { [horizontal]: 0.33, [emphasis]: 0.33, [subject]: 0 },
      gold: { [horizontal]: 'present', [emphasis]: 'present', [subject]: 'absent' },
    });
    expect(report.version).toBe(6);
    expect(report.limitations).toContain('C=0,66/10');
    expect(report.limitations).toContain('anciens rapports et archives');
  });
  it('rapporte les trois cas séparément et préserve un résultat interrompu comme non conclu', () => {
    const report = buildScientificDiagramFixtureReport([
      { caseId: 'A', repetition: 1, record: record() },
      { caseId: 'B', repetition: 1, record: record('failed') },
    ], 3, '2026-11-07T20:10:00Z');
    expect(report.cases.map((item) => [item.caseId, item.referenceScore]))
      .toEqual([['A', 9.84], ['B', 7.36], ['C', 0.66], ['D', 9.34], ['E', 8.66]]);
    expect(report.cases[0]?.summaries[0]).toMatchObject({ runsCompleted: 1, complete: false });
    expect(report.cases[1]?.summaries[0]).toMatchObject({ runsCompleted: 1, successfulRuns: 0, accuracyPercent: 0 });
    expect(report.cases[2]?.summaries).toEqual([]);
    expect(report.cases[3]?.summaries).toEqual([]);
    expect(report.cases[4]?.summaries).toEqual([]);
    expect(report.cases[1]?.experiments[0]?.status).toBe('failed');
  });
  it('isole uniquement la validité des flèches entre le témoin D et le piège E', () => {
    const control = SCIENTIFIC_DIAGRAM_FIXTURES.find((fixture) => fixture.id === 'D')!;
    const trap = SCIENTIFIC_DIAGRAM_FIXTURES.find((fixture) => fixture.id === 'E')!;
    const legend = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.find((criterion) => criterion.id === 'legends')!;
    expect(legend.subcriteria?.find((sub) => sub.id === 'legends-visible')).toMatchObject({
      maxPoints: 0.68,
      description: expect.stringContaining('trait de rappel'),
    });
    expect(control.labelPointerChallenge).toMatchObject({ kind: 'label-pointer-correspondence',
      expected: 'correct', criterionKey: SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET });
    expect(trap.labelPointerChallenge).toMatchObject({ kind: 'label-pointer-correspondence',
      expected: 'incorrect', criterionKey: SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET });
    const alignment = diagramTargetKey('legends', 'legends-aligned');
    expect(control.referenceScore).toBe(9.34);
    expect(trap.referenceScore).toBe(8.66);
    // The user-visible teacher rubric explicitly requires a COLUMN of legends.
    // Both drawings place labels on horizontal rows beneath the cells.
    for (const fixture of [control, trap]) {
      expect(fixture.gold[alignment]).toBe('absent');
      expect(fixture.referencePoints[alignment]).toBe(0);
      // Horizontal writing stays valid; only COLUMN alignment is missing.
      expect(fixture.gold[diagramTargetKey('legends', 'legends-horizontal')]).toBe('present');
      expect(fixture.referencePoints[diagramTargetKey('legends', 'legends-horizontal')]).toBe(0.66);
      expect(fixture.layoutObservation).toMatchObject({
        criterionKey: alignment, points: 0, maximumPoints: 0.66,
        reason: expect.stringContaining('non alignées en colonne'),
      });
    }
    expect(control.gold[SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET]).toBe('present');
    expect(trap.gold[SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET]).toBe('absent');
    expect(control.referencePoints[SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET]).toBe(0.68);
    expect(trap.referencePoints[SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET]).toBe(0);
    expect(control.referenceScore - trap.referenceScore).toBeCloseTo(0.68);
    for (const key of Object.keys(control.gold)) {
      if (key === SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET) continue;
      expect(trap.gold[key]).toBe(control.gold[key]);
      expect(trap.referencePoints[key]).toBe(control.referencePoints[key]);
    }
    const report = buildScientificDiagramFixtureReport(
      [{ caseId: 'E', repetition: 1, record: record() }], 1, '2026-11-08T23:00:00Z');
    expect(report.version).toBe(6);
    expect(report.protocolId).toBe('scientific-diagram-generated-a-b-c-plus-label-pointers-v6');
    expect(report.cases.find((item) => item.caseId === 'E')?.labelPointerChallenge)
      .toMatchObject({ expected: 'incorrect', criterionKey: SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET });
    expect(report.cases.filter((item) => item.caseId === 'D' || item.caseId === 'E')
      .map((item) => item.layoutObservation)).toEqual([control.layoutObservation, trap.layoutObservation]);
  });
  it('utilise des dessins D/E visuellement identiques hors extrémités de quatre traits de rappel', async () => {
    const [control, trap] = await Promise.all([
      readFile(new URL('../assets/pilot/scientific-mitosis-labels-control.svg', import.meta.url), 'utf8'),
      readFile(new URL('../assets/pilot/scientific-mitosis-labels-swapped.svg', import.meta.url), 'utf8'),
    ]);
    const line = /<line id="(pointer-[^"]+)" class="pointer" x1="(\d+)" y1="(\d+)" x2="(\d+)" y2="(\d+)"\/>/g;
    const arrows = (svg: string) => Object.fromEntries([...svg.matchAll(line)].map((m) =>
      [m[1]!, { start: [Number(m[2]), Number(m[3])], end: [Number(m[4]), Number(m[5])] }]));
    const a = arrows(control), b = arrows(trap);
    expect(Object.keys(a)).toHaveLength(6);
    expect(Object.keys(b)).toEqual(Object.keys(a));
    expect(control.replace(line, (_all, id, x1, y1) =>
      `<line id="${id}" class="pointer" x1="${x1}" y1="${y1}" x2="TARGET" y2="TARGET"/>`))
      .toBe(trap.replace(line, (_all, id, x1, y1) =>
        `<line id="${id}" class="pointer" x1="${x1}" y1="${y1}" x2="TARGET" y2="TARGET"/>`));
    for (const id of Object.keys(a)) expect(a[id]!.start).toEqual(b[id]!.start);
    for (const [left, right] of [
      ['pointer-metaphase-chromosomes', 'pointer-metaphase-fuseau'],
      ['pointer-telophase-noyau', 'pointer-telophase-plaque'],
    ]) {
      expect(b[left]!.end).toEqual(a[right]!.end);
      expect(b[right]!.end).toEqual(a[left]!.end);
    }
    for (const id of ['pointer-interphase-noyau', 'pointer-prophase-chromosomes']) {
      expect(b[id]!.end).toEqual(a[id]!.end);
    }
    expect(control).toContain('Chromosomes');
    expect(control).toContain('Plaque cellulaire');
    expect(trap).not.toContain('piège');
  });
  function scoredFixtureRecord(caseId: 'D' | 'E', detectTrap: boolean): ModelEvaluationRecord {
    const base = record();
    const fixture = SCIENTIFIC_DIAGRAM_FIXTURES.find((item) => item.id === caseId)!;
    const criteria = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.map((criterion) => {
      const subcriteria = getRubricSubcriteria(criterion).map((sub) => {
        const key = diagramTargetKey(criterion.id, sub.id);
        const points = detectTrap ? fixture.referencePoints[key]! : sub.maxPoints;
        return {
          subcriterionId: sub.id, title: sub.title, maxPoints: sub.maxPoints,
          points, evidence: sub.id === 'legends-visible' ? 'Le trait relie les mots aux structures observées.'
            : 'Détail visible dans le dessin.',
        };
      });
      return {
        criterionId: criterion.id,
        points: subcriteria.reduce((total, item) => total + item.points, 0),
        rationale: '', evidence: 'Observation synthétique.', confidence: 'high' as const,
        subcriteria,
      };
    });
    const score = detectTrap ? fixture.referenceScore : 10;
    return {
      ...base,
      configurations: [{ ...base.configurations[0]!, correctionMethod: 'generative' as const,
        directVisualDecision: false, directGenerativeVision: true }],
      results: [{
        ...base.results[0]!, directVisualDecision: false, score, diagnosticRuns: [],
        proposal: { criteria, finalScore: score, summary: '', questionsForTeacher: [] },
      }],
    };
  }

  it('diagnostique le biais tout-présent et la paire D/E sans prendre une bonne note pour une preuve de vision', () => {
    const report = buildScientificDiagramFixtureReport([
      { caseId: 'D', repetition: 1, record: scoredFixtureRecord('D', false) },
      { caseId: 'E', repetition: 1, record: scoredFixtureRecord('E', false) },
    ], 1, '2026-11-14');
    const pair = report.pairedDiagnostics[0]!;
    expect(report.diagnosticSchemaVersion).toBe(1);
    expect(pair).toMatchObject({
      status: 'missed', controlChoice: 'present', alteredChoice: 'present',
      identicalChoices: true, alignmentDetectedBoth: false,
      unchangedTargetsCompared: 18, unexpectedChanges: [],
      proposedScoreDifference: 0, expectedScoreDifference: 0.68,
    });
    const d = report.cases.find((item) => item.caseId === 'D')!;
    const e = report.cases.find((item) => item.caseId === 'E')!;
    expect(d.diagnostic[0]).toMatchObject({ scoreDelta: 0.66, allPresentPattern: true });
    expect(e.diagnostic[0]).toMatchObject({ scoreDelta: 1.34, allPresentPattern: true });
    expect(d.diagnostic[0]!.mismatchedTargets.map((item) => item.key))
      .toEqual([diagramTargetKey('legends', 'legends-aligned')]);
    expect(e.diagnostic[0]!.mismatchedTargets.map((item) => item.key))
      .toEqual([diagramTargetKey('legends', 'legends-aligned'), SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET]);
    expect(e.experiments[0]!.observations.find((item) => item.key === SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET))
      .toMatchObject({
        awardedPoints: 0.68, maxPoints: 0.68, evidenceState: 'provided',
        modelConfidence: 'high', teacherReviewRequested: false,
        syntheticEvidenceExcerpt: 'Le trait relie les mots aux structures observées.',
      });
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE_BASE64_IMAGE|PRIVATE_API_KEY|PRIVATE_ENDPOINT|PRIVATE_EXAM_PROMPT|PRIVATE_RAW_RESPONSE/);
  });

  it('reconnaît la mutation seulement si la bonne lecture D et la mauvaise lecture E sont effectivement observées', () => {
    const report = buildScientificDiagramFixtureReport([
      { caseId: 'D', repetition: 1, record: scoredFixtureRecord('D', true) },
      { caseId: 'E', repetition: 1, record: scoredFixtureRecord('E', true) },
    ], 1, '2026-11-14');
    expect(report.pairedDiagnostics[0]).toMatchObject({
      status: 'detected', controlChoice: 'present', alteredChoice: 'absent',
      alignmentDetectedBoth: true, proposedScoreDifference: 0.68,
      unexpectedChanges: [], identicalChoices: false,
    });
    const incomplete = buildScientificDiagramFixtureReport([
      { caseId: 'D', repetition: 1, record: scoredFixtureRecord('D', true) },
    ], 1, '2026-11-14');
    expect(incomplete.pairedDiagnostics[0]).toMatchObject({
      status: 'inconclusive', alteredChoice: 'uncertain', proposedScoreDifference: null,
    });
    expect(incomplete.pairedDiagnostics[0]!.identicalChoices).toBeNull();
    const differentModel = scoredFixtureRecord('E', true);
    differentModel.configurations[0]!.analysisModel = 'different-vision:12b';
    const mismatch = buildScientificDiagramFixtureReport([
      { caseId: 'D', repetition: 1, record: scoredFixtureRecord('D', true) },
      { caseId: 'E', repetition: 1, record: differentModel },
    ], 1, '2026-11-14');
    expect(mismatch.pairedDiagnostics).toHaveLength(2);
    expect(mismatch.pairedDiagnostics.every((pair) => pair.status === 'inconclusive')).toBe(true);
    expect(mismatch.pairedDiagnostics.map((pair) => pair.model).sort())
      .toEqual(['d1:3b', 'different-vision:12b']);
  });

  it('n’exporte aucune photographie, clé, endpoint, prompt ou réponse brute', () => {
    const report = JSON.stringify(buildScientificDiagramFixtureReport(
      [{ caseId: 'A', repetition: 1, record: record() }], 3, 'now'));
    for (const privateValue of [
      'PRIVATE_BASE64_IMAGE', 'PRIVATE_API_KEY', 'PRIVATE_ENDPOINT',
      'PRIVATE_EXAM_PROMPT', 'PRIVATE_RAW_RESPONSE',
    ]) expect(report).not.toContain(privateValue);
  });
});
