import { describe, expect, it } from 'vitest';
import { annotationEndpointIsLocal, appendNewCopyAnnotations, parseCopyAnnotationSuggestions, requiredCopyAnnotationDeductions } from '../../../src/correction/domain/copyAnnotationSuggestions.ts';

const criteria = [{ criterionId: 'titre', title: 'Titre', points: 2, maxPoints: 2, evidence: 'Titre visible', rationale: 'À souligner' }];

describe('annotation suggestions', () => {
  it('accepts explicitly local addresses and rejects remote or deceptive ones', () => {
    for (const endpoint of ['http://localhost:11434', 'http://127.0.0.1', 'https://mac-mini.local:1234/v1/responses', 'http://192.168.1.7', 'http://[fd00::1]:11434']) {
      expect(annotationEndpointIsLocal(endpoint)).toBe(true);
    }
    for (const endpoint of ['https://localhost.example.org', 'https://127.0.0.1@remote.test', 'https://remote.test/.local', 'ftp://127.0.0.1', 'https://192.169.1.7']) {
      expect(annotationEndpointIsLocal(endpoint)).toBe(false);
    }
  });

  it('preserves useful remarks while dropping uncertain, malformed and out-of-copy positions', () => {
    const placement = { pageNumber: 2, x: 300, y: 900 };
    const suggestions = parseCopyAnnotationSuggestions(JSON.stringify({ annotations: [
      { message: 'Souligne le titre.', criterionId: 'titre', locationConfidence: 'high', placement, points: 99 },
      { message: 'Ajoute un repère.', criterionId: 'missing', locationConfidence: 'low', placement },
      { message: 'Indique une échelle.', locationConfidence: 'high', placement: { ...placement, pageNumber: 3 } },
      { message: 'Relis la légende.', locationConfidence: 'high', placement: { ...placement, x: -12 } },
      { message: ' SOULIGNE le titre. ' },
    ] }), criteria, 2);
    expect(suggestions).toHaveLength(4);
    expect(suggestions[0]).toEqual({ id: expect.any(String), message: 'Souligne le titre.', criterionId: 'titre', placement, status: 'suggested' });
    expect(suggestions.slice(1).every((entry) => !entry.placement && !entry.criterionId)).toBe(true);
    expect(appendNewCopyAnnotations([{ ...suggestions[0], status: 'accepted' }], suggestions)[0].status).toBe('accepted');
    expect(appendNewCopyAnnotations(suggestions, suggestions)).toEqual(suggestions);
  });

  it('preserves explicit tones and leaves missing or invalid tones unqualified', () => {
    const notes = parseCopyAnnotationSuggestions(JSON.stringify({ annotations: [
      { message: 'Bon dessin', tone: 'positive', criterionId: 'titre' },
      { message: 'À souligner', tone: 'improvement', criterionId: 'titre' },
      { message: 'Autre', tone: 'invalid' }, { message: 'Ancienne' },
    ] }), criteria, 1);
    expect(notes.map((note) => note.tone)).toEqual(['positive', 'improvement', undefined, undefined]);
  });

  it('accepts an empty list and distinguishes it from unusable output', () => {
    expect(parseCopyAnnotationSuggestions('{"annotations":[]}', criteria, 1)).toEqual([]);
    expect(() => parseCopyAnnotationSuggestions('{"annotations":[{"placement":null}]}', criteria, 1)).toThrow(/illisibles/);
    expect(() => parseCopyAnnotationSuggestions('{"points":4}', criteria, 1)).toThrow(/liste/);
  });
});

describe('mandatory deduction annotations', () => {
  const detailed = [{
    ...criteria[0], points: 1, maxPoints: 2,
    subcriteria: [
      { subcriterionId: 'position', title: 'Placé en dessous', points: 1, maxPoints: 1, evidence: 'Titre sous le dessin' },
      { subcriterionId: 'underline', title: 'Souligné ou encadré', points: 0, maxPoints: 0.5, evidence: 'Titre non souligné' },
      { subcriterionId: 'scale', title: 'Grossissement', points: 0, maxPoints: 0.5, evidence: 'Grossissement absent' },
    ],
  }];
  it('derives each penalized subcriterion without duplicating the parent deduction', () => {
    const required = requiredCopyAnnotationDeductions(detailed);
    expect(required.map(({ title, pointsRemoved }) => ({ title, pointsRemoved }))).toEqual([
      { title: 'Titre — Souligné ou encadré', pointsRemoved: 0.5 },
      { title: 'Titre — Grossissement', pointsRemoved: 0.5 },
    ]);
    const placement = { pageNumber: 1, x: 600, y: 950 };
    const notes = parseCopyAnnotationSuggestions(JSON.stringify({ annotations: [
      { message: 'Bon titre', tone: 'positive', criterionId: 'titre' },
      { message: 'Souligne le titre.', tone: 'improvement', deductionId: required[0].deductionId, locationConfidence: 'high', placement },
      { message: 'Duplicate', tone: 'improvement', deductionId: required[0].deductionId },
      { message: 'Invalid positive', tone: 'positive', deductionId: required[1].deductionId },
    ] }), detailed, 1);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toMatchObject({ id: required[0].deductionId, message: 'Souligne le titre.', tone: 'improvement', criterionId: 'titre', placement });
    expect(notes[1]).toMatchObject({ id: required[1].deductionId, tone: 'improvement', criterionId: 'titre', message: 'Titre — Grossissement : Grossissement absent' });
    expect(notes[1].placement).toBeUndefined();
    expect(notes[2].tone).toBe('positive');
    expect(appendNewCopyAnnotations(notes, parseCopyAnnotationSuggestions('{"annotations":[]}', detailed, 1))).toEqual(notes);
  });

  it('never caps mandatory deductions or deduplicates distinct deductions by text', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ ...criteria[0], criterionId: 'c' + index, points: 0 }));
    const required = requiredCopyAnnotationDeductions(many);
    const response = JSON.stringify({ annotations: [
      ...Array.from({ length: 11 }, (_, index) => ({ message: 'Positive ' + index, tone: 'positive' })),
      ...required.map(({ deductionId }) => ({ deductionId, message: 'À compléter', tone: 'improvement' })),
    ] });
    const notes = parseCopyAnnotationSuggestions(response, many, 1);
    expect(notes.filter((note) => note.tone === 'improvement')).toHaveLength(12);
    expect(notes.filter((note) => note.tone === 'positive')).toHaveLength(10);
    expect(appendNewCopyAnnotations(notes.slice(0, 1), notes)).toHaveLength(22);
    expect(parseCopyAnnotationSuggestions('{"annotations":[]}', many, 1)).toHaveLength(12);
  });

  it('does not attribute a manually changed parent score to stale subcriteria', () => {
    expect(requiredCopyAnnotationDeductions([{ ...detailed[0], points: 1.5 }])).toEqual([
      expect.objectContaining({ title: 'Titre', pointsRemoved: 0.5 }),
    ]);
    expect(requiredCopyAnnotationDeductions([{ ...detailed[0], points: 2 }])).toEqual([]);
    expect(requiredCopyAnnotationDeductions([{ ...criteria[0], points: -1, maxPoints: -2 }])).toEqual([
      expect.objectContaining({ pointsRemoved: 1 }),
    ]);
  });
});
