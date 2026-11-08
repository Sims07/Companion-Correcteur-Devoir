import { describe, expect, it } from 'vitest';
import { SCIENTIFIC_DIAGRAM_FIXTURES, SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC, buildScientificDiagramFixtureReport } from '../src/domain/scientificDiagramFixtures';
import { getRubricSubcriteria } from '../src/domain/rubric';
import { buildDirectDiagramPrompt } from '../src/adapters/ai/prompts/directDiagramPrompt';

describe('reviewed B reference, independent of model predictions', () => {
  const fixture = SCIENTIFIC_DIAGRAM_FIXTURES.find(f => f.id === 'B')!;
  it('derives 7.36 from the 19 reviewed observations without a target-five constraint', () => {
    expect(fixture.referenceScore).toBe(7.36);
    expect(Object.values(fixture.referencePoints).reduce((a, b) => a + b, 0)).toBeCloseTo(7.36);
    expect(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.map(c =>
      Math.round(getRubricSubcriteria(c).reduce((sum, s) => sum + fixture.referencePoints[c.id + '::' + s.id], 0) * 100) / 100
    )).toEqual([3.02, 0.67, 1.67, 2]);
    for (const c of SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria) for (const s of getRubricSubcriteria(c)) {
      const key = c.id + '::' + s.id;
      expect(fixture.referencePoints[key]).toBeGreaterThanOrEqual(0);
      expect(fixture.referencePoints[key]).toBeLessThanOrEqual(s.maxPoints);
      expect(fixture.referenceReview?.notes[s.id]).toBeTruthy();
    }
    expect(Object.keys(fixture.referenceReview!.notes)).toHaveLength(19);
  });
  it('corrects visible neighbors and horizontal legends without making the title below or complete', () => {
    expect(fixture.gold['drawing::drawing-neighbors']).toBe('present');
    expect(fixture.gold['legends::legends-horizontal']).toBe('present');
    expect(fixture.gold['title::title-below']).toBe('absent');
    expect(fixture.gold['title::title-subject']).toBe('partial');
    expect(fixture.gold['legends::legends-aligned']).toBe('partial');
    expect(fixture.referenceReview!.notes['title-section']).toContain('applicabilité');
    expect(fixture.referenceReview!.notes['drawing-clean']).toContain('couleur seule');
  });
  it('versions the revised ground truth and exports its provisional rationale', () => {
    const report = buildScientificDiagramFixtureReport([], 1, '2026-11-08');
    expect(report.version).toBe(3);
    expect(report.protocolId).toBe('scientific-diagram-generated-a-b-c-plus-label-pointers-v3');
    expect(report.cases.map(c => c.referenceScore)).toEqual([10, 7.36, 0, 10, 9.32]);
    expect(report.cases[1].referenceReview?.status).toBe('provisional-visual-review');
    expect(report.limitations).not.toContain('5/10');
  });
  it('does not send reference scores or review notes to the model', () => {
    const prompt = buildDirectDiagramPrompt({ question: 'Examiner le schéma', rubric: JSON.stringify(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC) });
    expect(prompt).not.toContain('7.36');
    expect(prompt).not.toContain('referenceReview');
    for (const note of Object.values(fixture.referenceReview!.notes)) expect(prompt).not.toContain(note);
  });
});
