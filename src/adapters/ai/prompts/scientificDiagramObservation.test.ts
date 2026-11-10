import { describe, expect, it } from 'vitest';
import { buildDirectDiagramPrompt } from './directDiagramPrompt.ts';
import { buildScientificDiagramPrompt, buildConciseScientificDiagramPrompt, buildScientificDiagramRepairPrompt } from './scientificDiagramPrompts.ts';
import { prepareSystemOneRubric } from '../../../domain/systemOneDecision.ts';
import { SCIENTIFIC_DIAGRAM_OBSERVATION_RULES } from '../../../domain/scientificDiagramObservation.ts';
import type { ScientificDiagramAnalysisRequest } from '../../../ports/scientificDiagramAnalysis.ts';

const request: ScientificDiagramAnalysisRequest = {
  images: [{ mimeType: 'image/png', base64: 'pixels' }], question: 'Consigne témoin',
  model: 'vision', endpoint: 'http://localhost:11434', apiKey: '',
  rubric: { title: 'Barème témoin', criteria: [{ id: 'relation', title: 'Relation témoin',
    description: 'Description unique', maxPoints: 1, analysisMode: 'scientific-diagram',
    subcriteria: [{ id: 'arrow', title: 'Direction témoin', description: 'Pointe visible', maxPoints: 1 }] }] },
};

describe('scientific observation contract across grading routes', () => {
  it.each(['direct', 'direct-repair', 'page', 'page-repair', 'concise'] as const)(
    'keeps visual grounding, source separation and rubric in %s', (route) => {
      const direct = { question: request.question, rubric: JSON.stringify(request.rubric), images: request.images };
      const prompt = route === 'direct' ? buildDirectDiagramPrompt(direct)
        : route === 'direct-repair' ? buildDirectDiagramPrompt(direct, 'missing-id')
        : route === 'page' ? buildScientificDiagramPrompt(request)
        : route === 'page-repair' ? buildScientificDiagramRepairPrompt(request, 'missing-id', '{}')
        : buildConciseScientificDiagramPrompt(request);
      expect(prompt).toContain(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES);
      expect(prompt).toContain('Direction témoin');
      expect(prompt).toContain('Consigne témoin');
      expect(prompt).toContain('JSON');
      if (route === 'page' || route === 'page-repair') {
        expect(prompt).toContain('Les points partiels exigent une partie correcte démontrée');
        expect(prompt).toContain('visiblement absents ou incorrects, attribue zéro');
      }
      if (route === 'concise') {
        expect(prompt).toContain('requiresTeacherReview=true');
        expect(prompt.length).toBeLessThan(buildScientificDiagramPrompt(request).length);
      }
    });

  it('adds diagram reading only to image-native scientific criteria, preserving text and other visual tasks', () => {
    const input = { criteria: request.rubric.criteria, question: request.question, transcription: 'Réponse témoin' };
    expect(prepareSystemOneRubric({ ...input, visualEvidence: true }).state).toContain(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES);
    expect(prepareSystemOneRubric(input).state).not.toContain(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES);
    expect(prepareSystemOneRubric({ ...input, visualEvidence: true,
      criteria: input.criteria.map(({ analysisMode: _mode, ...criterion }) => criterion),
    }).state).not.toContain(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES);
  });
});
