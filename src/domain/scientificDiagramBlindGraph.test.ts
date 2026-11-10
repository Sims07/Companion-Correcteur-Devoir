import { describe, expect, it } from 'vitest';
import {
  BLIND_VISUAL_OBSERVATION_PROMPT, BLIND_VISUAL_OBSERVATION_ISOLATED_PROMPT, blindVisualObservationPrompt,
  buildBlindVisualObservationReport, compareBlindVisualGraph,
  parseObservedVisualGraph, explainBlindVisualGraph, canObserveBlindGraph, blindGraphVisionModel, blindGraphProfileIssue, type ObservedVisualGraph,
} from './scientificDiagramBlindGraph.ts';
import { DIAGRAM_SENSITIVITY_TARGETS as T } from './scientificDiagramSensitivity.ts';
import { defaultAiModelConfiguration, type AiModelProfile } from './aiModelProfiles.ts';

const graph = (): ObservedVisualGraph => ({
  labels: ['Cellule', 'Noyau', 'ADN', 'ARN', 'Protéine'],
  arrows: [
    { first: 'ADN', second: 'ARN', tip: 'second' },
    { first: 'ARN', second: 'Protéine', tip: 'second' },
  ],
  containment: [{ inner: 'Noyau', outer: 'Cellule', relation: 'inside' }],
  arrowsComplete: true,
});

describe('lecture graphe visuel sans barème', () => {
  it('does not disclose biology expected edges, scores or rubric in the image prompt', () => {
    expect(BLIND_VISUAL_OBSERVATION_PROMPT).not.toMatch(/ADN|ARN|Protéine|Noyau|barème d.e correction|transcription|note finale/);
    expect(BLIND_VISUAL_OBSERVATION_PROMPT).toContain('pointe');
    expect(BLIND_VISUAL_OBSERVATION_PROMPT).toContain('partiellement masquée');
    expect(BLIND_VISUAL_OBSERVATION_PROMPT).toContain('utilise unclear');
    expect(BLIND_VISUAL_OBSERVATION_PROMPT).toContain('scientifiquement surprenante');
    expect(BLIND_VISUAL_OBSERVATION_PROMPT).toContain('ne note rien');
  });
  it('preserves the original blind prompt while adding an isolated-arrow/outside-contour A/B arm', () => {
    expect(blindVisualObservationPrompt('baseline')).toBe(BLIND_VISUAL_OBSERVATION_PROMPT);
    expect(blindVisualObservationPrompt('isolated-arrows-outside')).toBe(BLIND_VISUAL_OBSERVATION_ISOLATED_PROMPT);
    expect(BLIND_VISUAL_OBSERVATION_PROMPT).not.toContain('EXAMEN INDÉPENDANT');
    expect(BLIND_VISUAL_OBSERVATION_ISOLATED_PROMPT).toContain('une flèche inversée');
    expect(BLIND_VISUAL_OBSERVATION_ISOLATED_PROMPT).toContain('entièrement à l’extérieur');
    expect(BLIND_VISUAL_OBSERVATION_ISOLATED_PROMPT).toContain('Une pointe illisible');
    expect(BLIND_VISUAL_OBSERVATION_ISOLATED_PROMPT).not.toMatch(/ADN|ARN|Protéine|Noyau|transcription|note finale/);
  });

  it('preserves the baseline prompt for independent follow-up arms', () => {
    expect(blindVisualObservationPrompt('recheck-arrows')).toBe(BLIND_VISUAL_OBSERVATION_PROMPT);
    expect(blindVisualObservationPrompt('recheck-contours')).toBe(BLIND_VISUAL_OBSERVATION_PROMPT);
    const report = buildBlindVisualObservationReport([], 1, '2026-11-10T10:00:00Z', 'recheck-contours');
    expect(report.promptVariant).toBe('recheck-contours');
    expect(report.limitations).toContain('deux appels');
    expect(report.limitations).toContain('contours');
  });
  it('validates a complete finite and bounded observational graph', () => {
    expect(parseObservedVisualGraph(JSON.stringify(graph()))).toEqual(graph());
    expect(() => parseObservedVisualGraph('pas du JSON')).toThrow('JSON');
    expect(() => parseObservedVisualGraph(JSON.stringify({ ...graph(), arrowsComplete: 'yes' }))).toThrow('Structure');
    expect(() => parseObservedVisualGraph(JSON.stringify({ ...graph(), arrows: [{ first: 'A', second: 'B', tip: 'guessed' }] }))).toThrow('Flèche');
    expect(() => parseObservedVisualGraph(JSON.stringify({ ...graph(), containment: [{ inner: 'A', outer: 'B', relation: 'guessed' }] }))).toThrow('Inclusion');
    expect(() => parseObservedVisualGraph(JSON.stringify({ ...graph(), labels: Array(33).fill('A') }))).toThrow('Structure');
  });
  it('accepts optional blind image bounds, discards invalid localization without changing conclusions', () => {
    const bounded = graph();
    bounded.arrows[0] = { ...bounded.arrows[0]!, bounds: { left: 300, top: 380, right: 600, bottom: 620 } };
    expect(parseObservedVisualGraph(JSON.stringify(bounded)).arrows[0]?.bounds).toEqual(bounded.arrows[0]?.bounds);
    const invalid = JSON.parse(JSON.stringify(bounded)) as { arrows: Array<{ bounds: { left: number } }> };
    invalid.arrows[0]!.bounds.left = -5;
    const cleaned = parseObservedVisualGraph(JSON.stringify(invalid));
    expect(cleaned.arrows[0]?.bounds).toBeUndefined();
    expect(cleaned.arrows[0]?.tip).toBe('second');
  });
  it('compares actually observed directed ends to rubric only after extraction', () => {
    expect(compareBlindVisualGraph(graph())).toMatchObject({
      [T.transcription]: 'present', [T.translation]: 'present', [T.nucleus]: 'present',
    });
    const swapped = graph();
    swapped.arrows[0] = { first: 'ARN', second: 'ADN', tip: 'second' };
    expect(compareBlindVisualGraph(swapped)).toMatchObject({
      [T.transcription]: 'absent', [T.translation]: 'present', [T.nucleus]: 'present',
    });
    const wrongTarget = graph();
    wrongTarget.arrows[0] = { first: 'ADN', second: 'Protéine', tip: 'second' };
    expect(compareBlindVisualGraph(wrongTarget)[T.transcription]).toBe('absent');
    wrongTarget.arrowsComplete = false;
    expect(compareBlindVisualGraph(wrongTarget)[T.transcription]).toBe('uncertain');
    const outside = graph();
    outside.containment[0] = { inner: 'Noyau', outer: 'Cellule', relation: 'outside' };
    expect(compareBlindVisualGraph(outside)[T.nucleus]).toBe('absent');
    const noTip = graph();
    noTip.arrows[0] = { first: 'ADN', second: 'ARN', tip: 'none' };
    expect(compareBlindVisualGraph(noTip)[T.transcription]).toBe('uncertain');
    const conflicting = graph();
    conflicting.arrows.push({ first: 'ADN', second: 'ARN', tip: 'first' });
    expect(compareBlindVisualGraph(conflicting)[T.transcription]).toBe('uncertain');
  });
  it('does not mark missing labels, contradictions or ambiguous contours as scientifically wrong', () => {
    const missing = graph();
    missing.labels.splice(missing.labels.indexOf('ARN'), 1);
    expect(compareBlindVisualGraph(missing)[T.transcription]).toBe('uncertain');
    expect(compareBlindVisualGraph(missing)[T.translation]).toBe('uncertain');
    const contradictory = graph();
    contradictory.containment.push({ inner: 'Noyau', outer: 'Cellule', relation: 'outside' });
    expect(compareBlindVisualGraph(contradictory)[T.nucleus]).toBe('uncertain');
    contradictory.containment = [];
    expect(compareBlindVisualGraph(contradictory)[T.nucleus]).toBe('uncertain');
  });
  it('explains uncertainty and negative decisions without changing the verdict', () => {
    const g = graph();
    g.labels = g.labels.filter((label) => label !== 'ARN');
    expect(explainBlindVisualGraph(g)[T.transcription]?.reason).toBe('missing-label');
    g.labels.push('ARN');
    g.arrows[0]!.tip = 'none';
    expect(explainBlindVisualGraph(g)[T.transcription]?.reason).toBe('unclear-tip');
    g.arrows[0]!.tip = 'first';
    expect(explainBlindVisualGraph(g)[T.transcription]).toEqual({ choice: 'absent', reason: 'reversed-arrow' });
    g.arrows = [];
    expect(explainBlindVisualGraph(g)[T.transcription]?.reason).toBe('missing-edge-complete');
    g.arrowsComplete = false;
    expect(explainBlindVisualGraph(g)[T.transcription]?.reason).toBe('incomplete-arrows');
    g.containment.push({ inner: 'Noyau', outer: 'Cellule', relation: 'outside' });
    expect(explainBlindVisualGraph(g)[T.nucleus]?.reason).toBe('conflicting-containment');
    g.containment = [];
    expect(explainBlindVisualGraph(g)[T.nucleus]?.reason).toBe('missing-containment');
  });
  it('identifies the invalid field without echoing arbitrary model content in the validation error', () => {
    expect(() => parseObservedVisualGraph(JSON.stringify({ ...graph(), arrowsComplete: 'SECRET' }))).toThrow('arrowsComplete');
    expect(() => parseObservedVisualGraph(JSON.stringify({ ...graph(), arrows: [{ first: '', second: 'B', tip: 'first' }] }))).toThrow('arrows[0].first');
    expect(() => parseObservedVisualGraph(JSON.stringify({ ...graph(), labels: [''] }))).toThrow('labels[0]');
  });
  it('accepts explicit OpenAI-compatible Vision profiles, not remote Ollama or missing Vision models', () => {
    const profile: AiModelProfile = {
      id: 'cloud', name: 'OpenAI Vision', mode: 'single', updatedAt: '2026-11-09',
      configuration: { ...defaultAiModelConfiguration, endpoint: 'https://ai.zaup.org/v1/chat/completions',
        apiCompatible: true, apiKey: 'SECRET', visionModel: 'vision-27b' },
    };
    expect(canObserveBlindGraph(profile)).toBe(true);
    expect(canObserveBlindGraph({ ...profile, configuration: { ...profile.configuration, apiCompatible: false } })).toBe(false);
    expect(canObserveBlindGraph({ ...profile, configuration: { ...profile.configuration, endpoint: 'http://remote.example/v1/chat/completions' } })).toBe(false);
    expect(canObserveBlindGraph({ ...profile, configuration: { ...profile.configuration, visionModel: '', analysisModel: '' } })).toBe(false);
    expect(canObserveBlindGraph({ ...profile, configuration: { ...profile.configuration, endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '' } })).toBe(true);
  });

  it('runs any saved generative Vision model even when correction mode is decision-only', () => {
    const profile: AiModelProfile = {
      id: 'bonsai', name: 'Bonsai test', mode: 'single', updatedAt: '2026-11-10',
      configuration: { ...defaultAiModelConfiguration, correctionMethod: 'decision',
        analysisModel: 'tev1:4b', decisionModel: 'tev1:4b', generativeModel: 'bonsai-2:4b',
        visionModel: '', endpoint: 'http://localhost:11434' },
    };
    expect(blindGraphVisionModel(profile)).toBe('bonsai-2:4b');
    expect(canObserveBlindGraph(profile)).toBe(true);
    expect(blindGraphProfileIssue(profile)).toBeNull();

    const explicitReader = { ...profile, configuration: { ...profile.configuration, visionModel: 'qwen3.5:4b' } };
    expect(blindGraphVisionModel(explicitReader)).toBe('qwen3.5:4b');

    const decisionOnly = { ...profile, configuration: { ...profile.configuration, generativeModel: '' } };
    expect(blindGraphVisionModel(decisionOnly)).toBe('');
    expect(canObserveBlindGraph(decisionOnly)).toBe(false);
    expect(blindGraphProfileIssue(decisionOnly)).toContain('aucun modèle Vision');

    const remote = { ...profile, configuration: { ...profile.configuration,
      endpoint: 'https://vision.example.test/v1/chat/completions', apiCompatible: true } };
    expect(blindGraphVisionModel(remote)).toBe('bonsai-2:4b');
    expect(canObserveBlindGraph(remote)).toBe(true);
    expect(blindGraphProfileIssue({ ...remote, configuration: { ...remote.configuration,
      endpoint: 'http://vision.example.test/v1/chat/completions' } })).toContain('HTTPS');
    expect(canObserveBlindGraph({ ...remote, configuration: { ...remote.configuration, apiCompatible: false } })).toBe(false);
  });

  it('reports cloud transfer accurately without exposing the server address or key', () => {
    const report = buildBlindVisualObservationReport([{
      caseId: 'S0', repetition: 1, profileId: 'cloud', profileName: 'Vision distante', model: 'vision-27b',
      provider: 'openai-compatible', remote: true, status: 'success', durationMs: 18,
      observations: {}, arrowCount: 0, containmentCount: 0,
    }], 1, '2026-11-09');
    expect(report.localOnly).toBe(false);
    expect(report.cases[0]?.experiments[0]?.provider).toBe('openai-compatible');
    expect(JSON.stringify(report)).not.toContain('https://ai.zaup.org');
    expect(JSON.stringify(report)).not.toContain('SECRET');
  });

  it('keeps failed output diagnostics in the exported report without inventing decisions', () => {
    const report = buildBlindVisualObservationReport([{
      caseId: 'S1', repetition: 1, profileId: 'local', profileName: 'Vision', model: 'qwen',
      status: 'failed', durationMs: 30, observations: {}, arrowCount: 0, containmentCount: 0,
      errorCategory: 'invalid-output', diagnostic: { rawResponse: '{', rawResponseTruncated: false,
        validationError: 'JSON visuel illisible.', doneReason: 'length' },
    }], 1, '2026-11-09');
    expect(report.cases[1]?.experiments[0]?.diagnostic?.validationError).toBe('JSON visuel illisible.');
    expect(report.cases[1]?.experiments[0]?.observations).toEqual({});
    expect(report.cases[1]?.experiments[0]?.graph).toBeUndefined();
  });
  it('exports decisions with graph and output diagnostics, never request data', () => {
    const observations = compareBlindVisualGraph(graph());
    const record = {
      caseId: 'S0' as const, repetition: 1, profileId: 'local', profileName: 'Vision Qwen',
      model: 'qwen:4b', status: 'success' as const,
      durationMs: 1200, observations, arrowCount: 2, containmentCount: 1,
      graph: graph(), relationDetails: explainBlindVisualGraph(graph()),
      diagnostic: { rawResponse: JSON.stringify(graph()), rawResponseTruncated: false, doneReason: 'stop', outputTokens: 120 },
    };
    const report = buildBlindVisualObservationReport([record], 1, '2026-11-09T12:00:00Z');
    expect(report.cases[0]?.experiments).toHaveLength(1);
    expect(report.version).toBe(2);
    expect(report.promptVariant).toBe('baseline');
    const experimental = buildBlindVisualObservationReport([record], 1, '2026-11-09T12:00:00Z', 'isolated-arrows-outside');
    expect(experimental.promptVariant).toBe('isolated-arrows-outside');
    expect(report.cases[0]?.experiments[0]?.graph).toEqual(graph());
    expect(report.cases[0]?.experiments[0]?.diagnostic?.rawResponse).toBe(JSON.stringify(graph()));
    expect(report.statistics).toHaveLength(1);
    expect(report.statistics[0]?.method).toBe('blind-graph');
    expect(JSON.stringify(report)).not.toContain('base64');
    expect(JSON.stringify(report)).not.toContain('messages');
    expect(JSON.stringify(report)).not.toContain('localhost');
    expect(report.cases[5]?.gold).not.toHaveProperty(T.transcription);
  });
});
