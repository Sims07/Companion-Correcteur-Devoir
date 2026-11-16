import { describe, expect, it } from 'vitest';
import { buildDirectDiagramPrompt } from '../../../../src/correction/adapters/ai/prompts/directDiagramPrompt.ts';
import { buildScientificDiagramPrompt, buildConciseScientificDiagramPrompt, buildScientificDiagramRepairPrompt } from '../../../../src/correction/adapters/ai/prompts/scientificDiagramPrompts.ts';
import { prepareSystemOneRubric } from '../../../../src/correction/domain/systemOneDecision.ts';
import { SCIENTIFIC_DIAGRAM_OBSERVATION_RULES } from '../../../../src/correction/domain/scientificDiagramObservation.ts';
import type { ScientificDiagramAnalysisRequest } from '../../../../src/correction/ports/scientificDiagramAnalysis.ts';

const request: ScientificDiagramAnalysisRequest = {
  images: [{ mimeType: 'image/png', base64: 'pixels' }], question: 'Consigne témoin',
  model: 'vision', endpoint: 'http://localhost:11434', apiKey: '',
  rubric: { title: 'Barème témoin', criteria: [{ id: 'relation', title: 'Relation témoin',
    description: 'Description unique', maxPoints: 1, analysisMode: 'scientific-diagram',
    subcriteria: [{ id: 'arrow', title: 'Direction témoin', description: 'Pointe visible', maxPoints: 1 }] }] },
};

describe('scientific observation contract across grading routes', () => {
  it('validates microscopy legend leaders by their actual endpoints without requiring arrowheads', () => {
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('dessin scientifique d’observation au microscope');
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('simple trait, SANS pointe de flèche nécessaire');
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('suis-le physiquement jusqu’à son extrémité');
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('reliée à une mauvaise structure est incorrecte');
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('uniquement si le schéma comporte réellement des flèches directionnelles');

    const direct = { question: request.question, rubric: JSON.stringify(request.rubric), images: request.images };
    const prompt = buildDirectDiagramPrompt(direct);
    expect(prompt).toContain('Un trait de rappel n’a PAS besoin de pointe de flèche ni de direction');
    expect(prompt).toContain('structure existe ailleurs');
    expect(prompt).toContain('légende → cible observée');
    for (const variant of [
      buildDirectDiagramPrompt(direct, 'missing-id'),
      buildScientificDiagramPrompt(request),
      buildScientificDiagramRepairPrompt(request, 'invalid-json', '{}'),
      buildConciseScientificDiagramPrompt(request),
      prepareSystemOneRubric({ criteria: request.rubric.criteria, question: request.question,
        transcription: 'Dessin observé', visualEvidence: true }).state,
    ]) {
      expect(variant).toContain('SANS pointe de flèche nécessaire');
      expect(variant).toContain('structure réellement touchée');
    }
  });

  it('explains legend column alignment without confusing it with horizontal writing or other diagrams', () => {
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('seulement si le barème exige « alignées en colonne »');
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('les uns sous les autres');
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('Plusieurs légendes côte à côte sur une même ligne ne forment PAS une colonne');
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('écriture horizontale des mots');
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('dessins distincts');
    const directPrompt = buildDirectDiagramPrompt({
      question: request.question, rubric: JSON.stringify(request.rubric), images: request.images,
    });
    expect(directPrompt).toContain('les uns sous les autres');
    expect(buildScientificDiagramPrompt(request)).toContain('les uns sous les autres');
    expect(buildConciseScientificDiagramPrompt(request)).toContain('les uns sous les autres');
  });
  it('separates local biology, legend identity, main title and global scoring without ignoring handwritten labels', () => {
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('TITRE PRINCIPAL');
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('au SEIN de chaque sous-schéma');
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('applique chaque sous-critère du barème UNE SEULE FOIS');
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('une structure reconnaissable mais mal nommée'.replace('une', 'Une'));
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).toContain('puis lis le nom de la phase et les légendes');
    expect(SCIENTIFIC_DIAGRAM_OBSERVATION_RULES).not.toContain('indépendamment des noms écrits');
    const direct = buildDirectDiagramPrompt({
      question: request.question, rubric: JSON.stringify(request.rubric), images: request.images,
    });
    expect(direct).toContain('Si tu observes le titre principal AU-DESSUS');
    expect(direct).toContain('sans prendre le nom pour une preuve de structure');
  });

  it('transmits title-vs-caption and legend-vs-callout safeguards to all image grading routes', () => {
    const direct = { question: request.question, rubric: JSON.stringify(request.rubric), images: request.images };
    const prompts = [
      buildDirectDiagramPrompt(direct),
      buildDirectDiagramPrompt(direct, 'invalid-json'),
      buildScientificDiagramPrompt(request),
      buildScientificDiagramRepairPrompt(request, 'invalid-json', '{}'),
      buildConciseScientificDiagramPrompt(request),
      prepareSystemOneRubric({ criteria: request.rubric.criteria, question: request.question,
        transcription: 'Schéma observé', visualEvidence: true }).state,
    ];
    for (const prompt of prompts) {
      expect(prompt).toContain('un numéro de panneau');
      expect(prompt).toContain('un intitulé LOCAL');
      expect(prompt).toContain('zéro uniquement pour « placé en dessous »');
      expect(prompt).toContain('Un seul');
    }
    expect(prompts[0]).toContain('attribue 0 UNIQUEMENT');
    expect(prompts[2]).toContain('ses autres qualités sont à évaluer séparément');
    expect(prompts[4]).toContain('titre PRINCIPAL placé sous l’ENSEMBLE');
  });

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
      if (route === 'direct' || route === 'direct-repair') {
        expect(prompt).toContain('légende → cible observée');
        expect(prompt).toContain('Si le trajet ou la cible est indiscernable, signale le doute');
        expect(prompt).toContain('évalue chaque attendu une seule fois');
        expect(prompt).toContain('dessins distincts');
        expect(prompt).toContain('confidence=low');
        expect(prompt).toContain('questionForTeacher précise');
        expect(prompt).toContain('beauté subjective');
      }
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
