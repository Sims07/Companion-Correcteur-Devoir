import { describe, expect, it } from 'vitest';
import { buildGradingPrompt } from '../src/adapters/ai/gradingPrompt.ts';

describe('grading prompt', () => {
  it('prevents default-zero and generic clarification questions', () => {
    const prompt = buildGradingPrompt('{"criteria":[{"id":"knowledge","maxPoints":8}]}', 'Expliquez la respiration cellulaire');
    expect(prompt).toContain('Ne mets jamais 0 par défaut');
    expect(prompt).toContain('N’utilise pas low systématiquement');
    expect(prompt).toContain('Ne pose une question que si une ambiguïté concrète peut modifier les points');
    expect(prompt).toContain('identifiants et maximums fournis');
  });
});
