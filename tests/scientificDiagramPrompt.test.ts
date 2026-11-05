import { describe, expect, it } from 'vitest';
import { buildScientificDiagramPrompt } from '../src/adapters/ai/openAiScientificDiagramAnalyzer.ts';
import type { ScientificDiagramAnalysisRequest } from '../src/ports/scientificDiagramAnalysis.ts';

describe('scientific diagram prompt and professor marks', () => {
  it('uses only teacher-defined subcriteria and does not request a fixed quality grid', () => {
    const request: ScientificDiagramAnalysisRequest = {
      images: [{ mimeType: 'image/png', base64: 'aGVsbG8=' }],
      pageNumbers: [1],
      question: 'Dessiner une cellule',
      rubric: { title: 'Barème', criteria: [{ id: 'diagram', title: 'Schéma', description: '', maxPoints: 3, subcriteria: [
        { id: 'membrane', title: 'Membrane', description: 'Contour fermé', maxPoints: 2 },
        { id: 'nucleus', title: 'Noyau', description: '', maxPoints: 1 },
      ] }] },
      model: 'vision',
      endpoint: 'http://localhost:11434',
      apiKey: '',
    };
    const prompt = buildScientificDiagramPrompt(request);
    expect(prompt).toContain('Membrane');
    expect(prompt).toContain('Noyau');
    expect(prompt).not.toContain('qualityBreakdown');
    expect(prompt).not.toContain('arrows-relations');
    expect(prompt).toContain('ne déduis jamais automatiquement un demi-point');
    expect(prompt).toContain('origin=student-diagram');
    expect(prompt).toContain('une légende de phase ne constitue pas à elle seule un titre global');
  });

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
