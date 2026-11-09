import { describe, expect, it } from 'vitest';
import { validateRubric } from './rubric.ts';
import {
  DIAGRAM_SENSITIVITY_CASES, DIAGRAM_SENSITIVITY_CASE_IDS, DIAGRAM_SENSITIVITY_RUBRIC,
  DIAGRAM_SENSITIVITY_TARGETS, scientificDiagramSensitivitySvg, scientificDiagramSensitivityPreviewUrl,
  summarizeDiagramSensitivity, type DiagramSensitivityReading,
} from './scientificDiagramSensitivity.ts';

const keys = DIAGRAM_SENSITIVITY_TARGETS;
const allPresent = (): Record<string, 'present'> => ({
  [keys.transcription]: 'present', [keys.translation]: 'present', [keys.nucleus]: 'present',
});
function reading(
  caseId: DiagramSensitivityReading['caseId'],
  changes: Partial<DiagramSensitivityReading['observations']> = {},
  repetition = 1,
): DiagramSensitivityReading {
  return { caseId, profileId: 'qwen', method: 'direct-image-generative', repetition,
    observations: { ...allPresent(), ...changes } };
}

describe('sensibilité sémantique des schémas', () => {
  it('defines only measurable biological relations without changing the teacher rubric', () => {
    expect(validateRubric(DIAGRAM_SENSITIVITY_RUBRIC)).toMatchObject({ valid: true, maximumPoints: 3 });
    expect(DIAGRAM_SENSITIVITY_RUBRIC.criteria[0]?.subcriteria).toHaveLength(3);
    expect(DIAGRAM_SENSITIVITY_CASE_IDS).toHaveLength(6);
    expect(DIAGRAM_SENSITIVITY_CASES.map((item) => item.referenceScore))
      .toEqual([3, 2, 2, 2, 3, null]);
    expect(DIAGRAM_SENSITIVITY_CASES[5]?.gold).not.toHaveProperty(keys.transcription);
    for (const testCase of DIAGRAM_SENSITIVITY_CASES) {
      expect(testCase.gold[keys.translation]).toBe('present');
    }
  });

  it('creates distinct local vector diagrams while keeping labels and no answer leakage', () => {
    const svg = DIAGRAM_SENSITIVITY_CASE_IDS.map(scientificDiagramSensitivitySvg);
    expect(new Set(svg).size).toBe(6);
    for (const variant of svg) {
      expect(variant).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(variant).toContain('>ADN</text>');
      expect(variant).toContain('>ARN</text>');
      expect(variant).toContain('>Protéine</text>');
      expect(variant).toContain('>Noyau</text>');
      expect(variant).toContain('>Cellule</text>');
      expect(variant).not.toMatch(/Attendu|correct|inverse|erreur|référence|points|note/);
    }
    // Controlled mutant: only the first edge direction changes, not the biology labels.
    expect(svg[0]).toContain('M457 310 L571 310');
    expect(svg[1]).toContain('M574 310 L457 310');
    expect(svg[2]).toContain('L905 265');
    expect(svg[3]).toContain('cx="122" cy="310"');
    expect(svg[4]).toContain('M735 262 L735 397');
    expect(svg[5]).toContain('M457 310 L571 310" fill="none"');
    expect(scientificDiagramSensitivityPreviewUrl('S0')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it('measures three controlled mutations independently of totals and layout', () => {
    const summary = summarizeDiagramSensitivity([
      reading('S0'), reading('S1', { [keys.transcription]: 'absent' }),
      reading('S2'), reading('S3', { [keys.nucleus]: 'absent' }),
      reading('S4'), reading('S5', { [keys.transcription]: 'uncertain' }),
    ]);
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({
      sensitivityHits: 2, sensitivityTrials: 3, sensitivityUnknown: 0,
      correctControls: 6, controlObservations: 6, falsePositiveCount: 0,
      layoutPreserved: 3, layoutChecks: 3, readingsCount: 18, abstentions: 1,
    });
  });

  it('never calls a missing or uncertain pairing a negative result', () => {
    expect(summarizeDiagramSensitivity([
      reading('S1', { [keys.transcription]: 'absent' }),
      reading('S2', { [keys.transcription]: 'uncertain' }),
    ])[0]).toMatchObject({ sensitivityHits: 0, sensitivityTrials: 0, sensitivityUnknown: 2 });
    expect(summarizeDiagramSensitivity([
      reading('S0', { [keys.nucleus]: 'absent' }),
      reading('S3', { [keys.nucleus]: 'absent' }),
    ])[0]).toMatchObject({
      sensitivityHits: 0, sensitivityTrials: 1, sensitivityUnknown: 0,
      falsePositiveCount: 1, controlObservations: 3,
    });
  });

  it('pairs repeated runs by repetition and profile/method, not by list position', () => {
    const a = reading('S0', {}, 2);
    const b = reading('S1', { [keys.transcription]: 'absent' }, 1);
    const c = reading('S0', {}, 1);
    const d = { ...reading('S1', {}, 2), method: 'vision-then-analysis' };
    const results = summarizeDiagramSensitivity([a, b, d, c]);
    const direct = results.find((item) => item.method === 'direct-image-generative');
    const twoStep = results.find((item) => item.method === 'vision-then-analysis');
    expect(direct).toMatchObject({ sensitivityHits: 1, sensitivityTrials: 1 });
    expect(twoStep).toMatchObject({ sensitivityHits: 0, sensitivityTrials: 0, sensitivityUnknown: 1 });
  });
});
