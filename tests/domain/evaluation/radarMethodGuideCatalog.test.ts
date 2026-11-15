import { describe, expect, it } from 'vitest';
import { scienceMethods } from '../../../src/evaluation/domain/radarTimeline.ts';
import { biologyMethodLabels } from '../../../src/evaluation/domain/radarMethodExclusions.ts';
import {
  BIOLOGY_METHOD_PRESENTATION, SCIENCE_METHOD_PRESENTATION, radarMethodGuideEntries,
} from '../../../src/evaluation/domain/radarMethodGuideCatalog.ts';

describe('catalogue des fiches illustrées du laboratoire', () => {
  it('présente toutes les méthodes canoniques avec une illustration, même sans radar', () => {
    expect(Object.keys(SCIENCE_METHOD_PRESENTATION).sort()).toEqual(Object.keys(scienceMethods).sort());
    expect(Object.keys(BIOLOGY_METHOD_PRESENTATION).sort()).toEqual(Object.keys(biologyMethodLabels).sort());
    const science = radarMethodGuideEntries('diagrams');
    const biology = radarMethodGuideEntries('biology');
    expect(science.map(entry => entry.id)).toEqual([
      'image-direct-v1', 'pixel-v1', 'leaders-v1', 'direct-v1', 'guided-v1', 'graph-first-v1',
    ]);
    expect(biology).toHaveLength(3);
    expect(science.map(entry => entry.label)).toEqual(science.map(entry =>
      scienceMethods[entry.id as keyof typeof scienceMethods].label));
    expect(biology.map(entry => entry.label)).toEqual(Object.values(biologyMethodLabels));
    for (const entry of [...science, ...biology]) {
      expect(entry.title.length).toBeGreaterThan(12);
      expect(entry.summary.length).toBeGreaterThan(30);
      expect(entry.visualCaption.length).toBeGreaterThan(40);
      expect(entry.science.steps.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('utilise une illustration distincte par méthode et décrit les limites des détecteurs', () => {
    const entries = radarMethodGuideEntries('diagrams');
    expect(new Set(entries.map(item => item.illustration)).size).toBe(entries.length);
    expect(new Set(radarMethodGuideEntries('biology').map(item => item.illustration)).size).toBe(3);
    expect(entries[0]?.illustration).toBe('direct-correction');
    expect(entries[0]?.science.principle).toContain('sans OCR');
    expect(entries[0]?.science.radarScope).toContain('extraction indépendante');
    expect(entries[1]?.science.radarScope).toContain('S0–S5');
    expect(entries[2]?.science.radarScope).toContain('S0–S5');
    expect(entries[1]?.science.limitations).toMatch(/fausses pointes/);
    expect(entries[2]?.science.limitations).toMatch(/manquée/);
  });
});
