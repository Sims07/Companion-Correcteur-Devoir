import { describe, expect, it } from 'vitest';
import { directDiagramSchema, parseDirectDiagramOutput } from '../../../src/correction/adapters/ai/directDiagramOutput.ts';
import { parseGradingProposal } from '../../../src/correction/domain/grading.ts';
import type { Rubric } from '../../../src/correction/domain/rubric.ts';

const rubric: Rubric = {
  title: 'Titre de mitose', criteria: [{ id: 'title', title: 'Titre principal', description: '',
    maxPoints: 0.33, analysisMode: 'scientific-diagram',
    subcriteria: [{ id: 'emphasis', title: 'Souligné ou encadré ou en majuscule', description: '', maxPoints: 0.33 }] }],
};

function analysis(observations?: { underlined: boolean; framed: boolean; uppercase: boolean }) {
  return JSON.stringify({ criteria: { title: {
    evidence: 'Titre en bas du dessin', confidence: 'high', questionForTeacher: '',
    subcriteria: { emphasis: {
      points: 0.33,
      evidence: 'Le titre est écrit en minuscules, sans soulignement ni encadrement particulier.',
      ...(observations ? { observations } : {}),
    } },
  } } });
}

describe('notation directe image vers schéma', () => {
  it('réserve trois observations booléennes au titre quand le barème contient une règle OU', () => {
    const schema = directDiagramSchema(rubric.criteria);
    const serialized = JSON.stringify(schema);
    expect(serialized).toContain('"observations"');
    expect(serialized).toContain('"underlined":{"type":"boolean"}');
  });

  it('n’accepte plus 0,33 pour les trois propriétés explicitement absentes', () => {
    for (const raw of [analysis(), analysis({ underlined: false, framed: false, uppercase: false })]) {
      const result = parseGradingProposal(parseDirectDiagramOutput(raw, rubric.criteria), rubric);
      expect(result.criteria[0].points).toBe(0);
      expect(result.criteria[0].subcriteria?.[0].points).toBe(0);
      expect(result.criteria[0].confidence).toBe('low');
      expect(result.criteria[0].questionForTeacher).toMatch(/vérifi|vérifiez/i);
    }
  });
});