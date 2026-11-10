import { describe, expect, it } from 'vitest';
import { buildScientificDiagramPrompt } from '../src/adapters/ai/openAiScientificDiagramAnalyzer.ts';
import { buildConciseScientificDiagramPrompt } from '../src/adapters/ai/prompts/scientificDiagramPrompts.ts';
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
    expect(prompt).not.toContain('bounds');
    expect(prompt).toContain('quatre phases d’une même mitose forment UN ensemble');
    expect(prompt).toContain('20 mots maximum');
    expect(prompt).toContain('Membrane');
    expect(prompt).toContain('Noyau');
    expect(prompt).not.toContain('qualityBreakdown');
    expect(prompt).not.toContain('arrows-relations');
    expect(prompt).toContain('ne déduis jamais automatiquement un demi-point');
    expect(prompt).toContain('origin=student-diagram');
    expect(prompt).toContain('une légende de phase ne constitue pas à elle seule un titre global');
  });

  it('keeps teachers rubric semantics in a compact local retry without resurrecting bounding boxes', () => {
    const request: ScientificDiagramAnalysisRequest = {
      images: [{ mimeType: 'image/png', base64: 'aGVsbG8=' }],
      question: 'Dessiner la mitose',
      rubric: { title: 'Mitose', criteria: [{ id: 'composition', title: 'Composition des phases',
        description: 'Mitose de cellule végétale', maxPoints: 2, subcriteria: [
          { id: 'phragmoplast', title: 'Phragmoplaste', description: 'Visible à la télophase', maxPoints: 2 },
        ] }] },
      model: 'qwen3.5:9b', endpoint: 'http://localhost:11434', apiKey: '',
    };
    const prompt = buildConciseScientificDiagramPrompt(request);
    expect(prompt).toContain('Composition des phases');
    expect(prompt).toContain('Mitose de cellule végétale');
    expect(prompt).toContain('Phragmoplaste');
    expect(prompt).toContain('Visible à la télophase');
    expect(prompt).not.toContain('bounds');
    expect(prompt).toContain('summary ≤ 10 mots');
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
    expect(prompt).toContain('Ignore uniquement les marques identifiées comme corrections professorales préexistantes');
    expect(prompt).toContain('recouvre ou touche un élément du schéma');
    expect(prompt).toContain('requiresTeacherReview à true');
    expect(prompt).not.toContain('ANNOTATIONS ENSEIGNANT À EXCLURE');
    expect(prompt).not.toContain('enseignant, si elles sont indiquées ci-dessous');
  });
});
