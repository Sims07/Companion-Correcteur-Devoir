import { describe, expect, it } from 'vitest';
import {
  CLASSROOM_CASE_IDS, CLASSROOM_SCENARIOS,
  classroomScenarioPreview, classroomScenarioSvg,
} from '../../../src/evaluation/domain/scientificDiagramClassroomCases.ts';
import {
  SCIENTIFIC_DIAGRAM_CLASSROOM_CASE_IDS, SCIENTIFIC_DIAGRAM_FIXTURES,
  SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC, buildScientificDiagramFixtureReport,
} from '../../../src/evaluation/domain/scientificDiagramFixtures.ts';
import { getRubricSubcriteria } from '../../../src/correction/domain/rubric.ts';

describe('three synthetic classroom mitosis examples', () => {
  it('uses original deterministic artwork and never copies a private worksheet or its teacher grading', () => {
    expect(CLASSROOM_CASE_IDS).toEqual(['R1', 'R2', 'R3']);
    expect(SCIENTIFIC_DIAGRAM_CLASSROOM_CASE_IDS).toEqual(CLASSROOM_CASE_IDS);
    const svgs = CLASSROOM_CASE_IDS.map(classroomScenarioSvg);
    expect(new Set(svgs).size).toBe(3);
    for (const [index, id] of CLASSROOM_CASE_IDS.entries()) {
      const svg = svgs[index]!;
      expect(svg).toMatch(/^<svg /);
      expect(svg).toContain('<rect width="1240" height="840" fill="#fff"/>');
      expect(svg).not.toMatch(/<image|data:image\/png|data:image\/jpeg|marker-end|<marker|Nom[s]? ?Pr[ée]nom|correcteur|\d+(?:[,\.]\d+)?\/10/i);
      expect((svg.match(/Dessin|Mitose|Mitoses/g) ?? []).length).toBeGreaterThan(0);
      expect((svg.match(/<g transform=/g) ?? []).length).toBe(4);
      expect(classroomScenarioPreview(id)).toContain('data:image/svg+xml;charset=utf-8,');
      expect(CLASSROOM_SCENARIOS[index]).toMatchObject({ id, synthetic: true, teacherValidated: false });
    }
  });

  it('contains the exact scientific challenge expected for each deliberately varied drawing', () => {
    const [good, rough, intermediate] = CLASSROOM_SCENARIOS;
    expect(good?.phases).toEqual(['prophase', 'metaphase', 'anaphase', 'telophase']);
    expect(good?.expectedFindings.join(' ')).toContain('Interphase');
    expect(rough?.phases).toEqual(['anaphase', 'interphase', 'prophase', 'telophase']);
    expect(rough?.expectedFindings.join(' ')).toContain('cytoplasme');
    expect(rough?.expectedFindings.join(' ')).toContain('cloisonnement');
    expect(intermediate?.phases).toEqual(['prophase', 'metaphase', 'anaphase', 'telophase']);
    expect(intermediate?.expectedFindings.join(' ')).toContain('membrane nucléaire');
    expect(intermediate?.expectedFindings.join(' ')).toContain('microtubules');
    expect(classroomScenarioSvg('R3')).toContain('microtubules');
    expect(classroomScenarioSvg('R3')).toContain('membrane nucléaire');
    expect(classroomScenarioSvg('R1')).not.toContain('INTERPHASE');
    expect(classroomScenarioSvg('R2')).toContain('INTERPHASE');
  });

  it('keeps a separate transparent provisional 19-target gold, not teacher marks copied to new images', () => {
    const expectedKeys = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.flatMap(c =>
      getRubricSubcriteria(c).map(s => c.id + '::' + s.id));
    const cases = SCIENTIFIC_DIAGRAM_FIXTURES.filter(c => c.classroomScenario);
    expect(cases.map(c => c.id)).toEqual(['R1', 'R2', 'R3']);
    expect(cases.map(c => c.referenceScore)).toEqual([9.5, 5.3, 6.67]);
    expect(cases.map(c => c.classroomScenario!.teacherValidated)).toEqual([false, false, false]);
    expect(cases.every(c => !('privateInspirationScore' in c.classroomScenario!))).toBe(true);
    for (const item of cases) {
      expect(Object.keys(item.gold)).toEqual(expectedKeys);
      expect(Object.keys(item.referencePoints)).toEqual(expectedKeys);
      expect(item.referenceReview?.status).toBe('provisional-visual-review');
    }
    expect(cases[0]?.referencePoints['understanding::understanding-interphase']).toBe(0);
    expect(cases[1]?.referencePoints['legends::legends-visible']).toBe(0);
    expect(cases[2]?.referencePoints['understanding::understanding-interphase']).toBe(0);
    const report = buildScientificDiagramFixtureReport([], 1, '2026-11-16T10:00:00Z');
    expect(report.cases.find(c => c.caseId === 'R2')?.classroomScenario)
      .toMatchObject({ origin: 'entirely-synthetic', teacherValidated: false });
    expect(report.localOnly).toBe(true);
    expect(report.limitations).toMatch(/références R1\/R2\/R3 restent non validées/);
  });
});
