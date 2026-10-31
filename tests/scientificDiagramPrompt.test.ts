import { describe, expect, it } from 'vitest';
import { buildScientificDiagramPrompt } from '../src/adapters/ai/openAiScientificDiagramAnalyzer.ts';
import type { ScientificDiagramAnalysisRequest } from '../src/ports/scientificDiagramAnalysis.ts';

describe('scientific diagram prompt and professor marks', () => {
  it('instructs Vision to ignore correction marks and request teacher review when they overlap a diagram', () => {
    const request: ScientificDiagramAnalysisRequest = {
      images: [{ mimeType: 'image/png', base64: 'aGVsbG8=' }],
      pageNumbers: [2],
      question: 'Dessiner une cellule',
      rubric: { title: 'Barème', criteria: [{ id: 'diagram', title: 'Schéma', description: 'Exactitude', maxPoints: 5 }] },
      model: 'vision',
      endpoint: 'http://localhost:11434',
      apiKey: '',
    };
    const prompt = buildScientificDiagramPrompt(request);
    expect(prompt).toContain('Ignore les marques de correction manuscrites préexistantes');
    expect(prompt).toContain('recouvre ou touche un élément du schéma');
    expect(prompt).toContain('requiresTeacherReview à true');
    expect(prompt).not.toContain('ANNOTATIONS ENSEIGNANT À EXCLURE');
    expect(prompt).not.toContain('enseignant, si elles sont indiquées ci-dessous');
  });
});
