import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  CLASSROOM_CASE_IDS, CLASSROOM_SCENARIOS,
} from '../../../src/evaluation/domain/scientificDiagramClassroomCases.ts';
import {
  SCIENTIFIC_DIAGRAM_CLASSROOM_CASE_IDS, SCIENTIFIC_DIAGRAM_FIXTURES,
  SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC, buildScientificDiagramFixtureReport,
} from '../../../src/evaluation/domain/scientificDiagramFixtures.ts';
import { getRubricSubcriteria } from '../../../src/correction/domain/rubric.ts';

/**
 * Fingerprints of the three high-quality raster encodes of the generated PNGs.
 * Unlike the former SVG source, the actual artwork is opaque and not redrawn.
 */
const rasterArt = [
  ['R1', 'classroom-mitosis-r1.webp', 744, 510, 'd8a94d2885603724d329374dd5a2f2a3fc38faef07bce0383562d98374a9b752'],
  ['R2', 'classroom-mitosis-r2.webp', 746, 509, 'd9de38d25f6c4fb6ffed21a37cd23c3d1d40064a6022f8dd62a1f4bef46f5c51'],
  ['R3', 'classroom-mitosis-r3.webp', 814, 487, '65cbfbaa75758452627138c1f984baaf95ec022d832502d111557f24cb97c7d4'],
] as const;

describe('three realistic generated mitosis drawings, never private student sheets', () => {
  it('bundles the exact raster assets rather than a vector drawing generator', async () => {
    expect(CLASSROOM_CASE_IDS).toEqual(['R1', 'R2', 'R3']);
    expect(SCIENTIFIC_DIAGRAM_CLASSROOM_CASE_IDS).toEqual(CLASSROOM_CASE_IDS);
    for (const [id, filename, width, height, fingerprint] of rasterArt) {
      const bytes = await readFile(new URL('../../../src/evaluation/assets/pilot/' + filename, import.meta.url));
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(fingerprint);
      expect(bytes.byteLength).toBeGreaterThan(30_000);
      expect(CLASSROOM_SCENARIOS.find(c => c.id === id))
        .toMatchObject({ id, synthetic: true, teacherValidated: false });
      // Height and width are validated using a browser decoder in the E2E suite.
      expect(width).toBeGreaterThan(700);
      expect(height).toBeGreaterThan(450);
    }
  });

  it('describes only observable errors in the actual generated pictures', () => {
    const [good, rough, intermediate] = CLASSROOM_SCENARIOS;
    expect(good?.phases).toEqual(['prophase', 'metaphase', 'anaphase', 'telophase']);
    expect(good?.expectedFindings.join(' ')).toContain('Interphase');
    expect(good?.expectedFindings.join(' ')).toContain('au-dessus');
    expect(rough?.phases).toEqual(['interphase', 'prophase', 'anaphase', 'telophase']);
    expect(rough?.expectedFindings.join(' ')).toContain('chromosome');
    expect(rough?.expectedFindings.join(' ')).toContain('plaque cellulaire');
    expect(rough?.expectedFindings.join(' ')).not.toContain('cytoplasme » arrive sur le noyau');
    expect(intermediate?.phases).toEqual(['prophase', 'metaphase', 'anaphase', 'telophase']);
    expect(intermediate?.expectedFindings.join(' ')).toContain('enveloppe nucléaire');
    expect(intermediate?.expectedFindings.join(' ')).toContain('microtubules');
  });

  it('recalibrates the 19 provisional criteria for raster artwork without copying private grades', () => {
    const expectedKeys = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.flatMap(c =>
      getRubricSubcriteria(c).map(s => c.id + '::' + s.id));
    const cases = SCIENTIFIC_DIAGRAM_FIXTURES.filter(c => c.classroomScenario);
    expect(cases.map(c => c.id)).toEqual(['R1', 'R2', 'R3']);
    expect(cases.map(c => c.referenceScore)).toEqual([9.17, 7.16, 8.01]);
    expect(cases.every(c => c.classroomScenario?.teacherValidated === false)).toBe(true);
    expect(cases.every(c => !('privateInspirationScore' in c.classroomScenario!))).toBe(true);
    for (const item of cases) {
      expect(Object.keys(item.gold)).toEqual(expectedKeys);
      expect(Object.keys(item.referencePoints)).toEqual(expectedKeys);
      expect(item.referenceReview?.status).toBe('provisional-visual-review');
      expect(item.referencePoints['title::title-below']).toBe(0);
    }
    expect(cases[0]?.referencePoints['understanding::understanding-interphase']).toBe(0);
    expect(cases[1]?.gold['legends::legends-visible']).toBe('partial');
    expect(cases[1]?.gold['legends::legends-aligned']).toBe('present');
    expect(cases[1]?.referencePoints['understanding::understanding-telophase']).toBe(0);
    expect(cases[2]?.referencePoints['title::title-section']).toBe(0.35);
    expect(cases[2]?.referencePoints['understanding::understanding-interphase']).toBe(0);
    const report = buildScientificDiagramFixtureReport([], 1, '2026-11-16T10:00:00Z');
    expect(report.version).toBe(9);
    expect(report.protocolId).toContain('classroom-raster-v9');
    expect(report.localOnly).toBe(true);
    expect(report.limitations).toContain('version 8');
  });
});
