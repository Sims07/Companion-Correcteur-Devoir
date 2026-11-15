import { describe, expect, it } from 'vitest';
import { scienceMethods } from '../../../src/evaluation/domain/radarTimeline.ts';
import { biologyMethodLabels } from '../../../src/evaluation/domain/radarMethodExclusions.ts';
import {
  SCIENCE_METHOD_DESCRIPTIONS, BIOLOGY_METHOD_DESCRIPTIONS,
} from '../../../src/evaluation/domain/radarMethodDescriptions.ts';

describe('descriptions scientifiques du laboratoire', () => {
  it('couvre exactement chaque méthode affichée dans les radars et les exclusions', () => {
    expect(Object.keys(SCIENCE_METHOD_DESCRIPTIONS).sort()).toEqual(Object.keys(scienceMethods).sort());
    expect(Object.keys(BIOLOGY_METHOD_DESCRIPTIONS).sort()).toEqual(Object.keys(biologyMethodLabels).sort());
    for (const description of [...Object.values(SCIENCE_METHOD_DESCRIPTIONS),
      ...Object.values(BIOLOGY_METHOD_DESCRIPTIONS)]) {
      expect(description.principle.length).toBeGreaterThan(45);
      expect(description.steps.length).toBeGreaterThanOrEqual(2);
      expect(description.interest.length).toBeGreaterThan(30);
      expect(description.limitations.length).toBeGreaterThan(30);
      expect(description.radarScope.length).toBeGreaterThan(30);
    }
  });

  it('distingue les indices locaux des petites pointes et des longs traits, sans promettre une correction automatique', () => {
    const pixel = SCIENCE_METHOD_DESCRIPTIONS['pixel-v1'];
    const leaders = SCIENCE_METHOD_DESCRIPTIONS['leaders-v1'];
    expect(pixel.principle).toContain('petites pointes');
    expect(pixel.steps.join(' ')).toMatch(/incertaines/);
    expect(leaders.steps.join(' ')).toMatch(/hampe fine/);
    expect(pixel.radarScope).toContain('#439');
    expect(leaders.radarScope).toContain('#438');
    expect(pixel.radarScope).toContain('S0–S5');
    expect(leaders.radarScope).toContain('S0–S5');
    expect(pixel.limitations).toMatch(/ne prouve ni la connexion/);
    expect(leaders.limitations).toMatch(/ne garantit pas/);
    expect(SCIENCE_METHOD_DESCRIPTIONS['direct-v1'].principle).toMatch(/sans indices/);
  });
});
