import { describe, expect, it } from 'vitest';
import { annotationEndpointIsLocal, appendNewCopyAnnotations, parseCopyAnnotationSuggestions } from '../../../src/correction/domain/copyAnnotationSuggestions.ts';

const criteria = [{ criterionId: 'titre', title: 'Titre', points: 1, maxPoints: 2, evidence: 'Titre visible', rationale: 'À souligner' }];

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

  it('accepts an empty list and distinguishes it from unusable output', () => {
    expect(parseCopyAnnotationSuggestions('{"annotations":[]}', criteria, 1)).toEqual([]);
    expect(() => parseCopyAnnotationSuggestions('{"annotations":[{"placement":null}]}', criteria, 1)).toThrow(/illisibles/);
    expect(() => parseCopyAnnotationSuggestions('{"points":4}', criteria, 1)).toThrow(/liste/);
  });
});
