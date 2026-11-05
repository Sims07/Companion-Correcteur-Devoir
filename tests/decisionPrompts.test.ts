import { describe, expect, it } from 'vitest';
import { buildCriterionDecisionPrompt, criterionDecisionSchema } from '../../src/adapters/ai/decisionPrompts.ts';

const criterion = { id: 'a', title: 'Respiration', description: 'Production ATP', maxPoints: 2,
  subcriteria: [{ id: 'a1', title: 'Mitochondrie', description: 'Site de respiration', maxPoints: 2 }] };

describe('decision prompt contract', () => {
  it('asks concise closed scientific decisions but never numerical model grades', () => {
    const prompt = buildCriterionDecisionPrompt({
      criterion, teacherQuestion: 'Décrivez la respiration.',
      transcription: 'Les mitochondries produisent l’ATP.',
    });
    expect(prompt).toContain('formulations scientifiquement équivalentes');
    expect(prompt).toContain('Ne calcule aucun point');
    expect(prompt).toContain('citation LITTÉRALE');
    expect(prompt).toContain('a1');
    expect(prompt).toContain('Les mitochondries produisent l’ATP.');
    expect(prompt).not.toContain('probabilité de réussite');
  });
  it('constrains exactly the explicit target ids and statuses', () => {
    const schema = criterionDecisionSchema(criterion);
    expect(schema.properties.criterionId.enum).toEqual(['a']);
    expect(schema.properties.decisions.minItems).toBe(1);
    expect(schema.properties.decisions.items.properties.targetId.enum).toEqual(['a1']);
    expect(schema.properties.decisions.items.properties.status.enum).toEqual(['present', 'absent', 'partial', 'uncertain']);
  });
});
