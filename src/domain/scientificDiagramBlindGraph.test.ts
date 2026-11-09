import { describe, expect, it } from 'vitest';
import {
  BLIND_VISUAL_OBSERVATION_PROMPT, buildBlindVisualObservationReport, compareBlindVisualGraph,
  parseObservedVisualGraph, type ObservedVisualGraph,
} from './scientificDiagramBlindGraph.ts';
import { DIAGRAM_SENSITIVITY_TARGETS as T } from './scientificDiagramSensitivity.ts';

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
    expect(BLIND_VISUAL_OBSERVATION_PROMPT).toContain('ne note rien');
  });
  it('validates a complete finite and bounded observational graph', () => {
    expect(parseObservedVisualGraph(JSON.stringify(graph()))).toEqual(graph());
    expect(() => parseObservedVisualGraph('pas du JSON')).toThrow('JSON');
    expect(() => parseObservedVisualGraph(JSON.stringify({ ...graph(), arrowsComplete: 'yes' }))).toThrow('Structure');
    expect(() => parseObservedVisualGraph(JSON.stringify({ ...graph(), arrows: [{ first: 'A', second: 'B', tip: 'guessed' }] }))).toThrow('Flèche');
    expect(() => parseObservedVisualGraph(JSON.stringify({ ...graph(), containment: [{ inner: 'A', outer: 'B', relation: 'guessed' }] }))).toThrow('Inclusion');
    expect(() => parseObservedVisualGraph(JSON.stringify({ ...graph(), labels: Array(33).fill('A') }))).toThrow('Structure');
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
  it('exports only summarized decisions, never pixels or the graph text', () => {
    const observations = compareBlindVisualGraph(graph());
    const record = {
      caseId: 'S0' as const, repetition: 1, profileId: 'local', profileName: 'Vision Qwen',
      model: 'qwen:4b', status: 'success' as const,
      durationMs: 1200, observations, arrowCount: 2, containmentCount: 1,
    };
    const report = buildBlindVisualObservationReport([record], 1, '2026-11-09T12:00:00Z');
    expect(report.cases[0]?.experiments).toHaveLength(1);
    expect(report.statistics).toHaveLength(1);
    expect(report.statistics[0]?.method).toBe('blind-graph');
    expect(JSON.stringify(report)).not.toContain('base64');
    expect(JSON.stringify(report)).not.toContain('messages');
    expect(JSON.stringify(report)).not.toContain('localhost');
    expect(report.cases[5]?.gold).not.toHaveProperty(T.transcription);
  });
});
