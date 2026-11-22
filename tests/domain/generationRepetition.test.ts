import { describe, expect, it } from 'vitest';
import { hasRepetitiveAnswerTail } from '../../src/shared/domain/generationRepetition.ts';

describe('repetitive final-answer detection', () => {
  it('detects the repeated Gemma evidence fragment even when JSON is unfinished', () => {
    const prefix = '{"criteria":{"drawing":{"evidence":"Le dessin occupe une grande partie de la page. ';
    const repeated = "part de l'image. ".repeat(24);
    expect(hasRepetitiveAnswerTail(prefix + repeated)).toBe(true);
  });

  it('ignores ordinary multi-criterion JSON with repeated field names', () => {
    const correction = JSON.stringify({
      criteria: Array.from({ length: 22 }, (_, index) => ({
        id: 'criterion-' + index,
        evidence: 'Structure observée en zone ' + index + ', relation vérifiée.',
        points: index % 2,
      })),
    });
    expect(correction.length).toBeGreaterThan(500);
    expect(hasRepetitiveAnswerTail(correction)).toBe(false);
  });

  it('does not report a brief repetition as a loop', () => {
    expect(hasRepetitiveAnswerTail("part de l'image. ".repeat(6))).toBe(false);
    expect(hasRepetitiveAnswerTail('')).toBe(false);
  });
});
