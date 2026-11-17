import { describe, expect, it } from 'vitest';
import { buildDirectDiagramPrompt } from '../../../src/correction/adapters/ai/prompts/directDiagramPrompt.ts';
import { buildFullGradingPrompt } from '../../../src/correction/adapters/ai/prompts/fullGradingPrompt.ts';
import { buildIncrementalCriterionPrompt } from '../../../src/correction/adapters/ai/gradingPrompts.ts';

const expectation = 'En métaphase, l’enveloppe nucléaire a disparu.';
const rubric = { title: 'Mitose', criteria: [{
  id: 'bio', title: 'Compréhension', description: 'Respect biologique', maxPoints: 2,
  analysisMode: 'scientific-diagram',
  subcriteria: [{ id: 'phase', title: 'Métaphase', description: 'Phase correcte', maxPoints: 2,
    scientificExpectations: [expectation] }],
}] };
const request = { question: 'Correction scientifique', rubric: JSON.stringify(rubric), images: [] };

describe('transport des références scientifiques validées', () => {
  it('utilise les attendus du barème direct sans appels de notation supplémentaires', () => {
    const prompt = buildDirectDiagramPrompt(request);
    expect(prompt).toContain(expectation);
    expect(prompt).toContain('lorsque le barème contient scientificExpectations');
    expect(prompt).toContain('ni malus, ni points supplémentaires');
  });
  it('respecte le même contrat dans le mode classique et par critère', () => {
    const full = buildFullGradingPrompt(request);
    expect(full).toContain(expectation);
    expect(full).toContain('scientificExpectations du barème');
    const incremental = buildIncrementalCriterionPrompt(full, {
      id: 'bio', title: 'Compréhension', description: 'Respect biologique', maxPoints: 2,
      subcriteria: rubric.criteria[0].subcriteria,
    });
    expect(incremental).toContain(expectation);
    expect(incremental).toContain('scientificExpectations du critère');
  });
});
