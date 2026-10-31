import { parseScientificDiagramAnalysis } from '../../domain/scientificDiagram.ts';
import type { ScientificDiagramAnalyzer, ScientificDiagramAnalysisRequest } from '../../ports/scientificDiagramAnalysis.ts';
import { createOpenAiCompatibleFetch } from './openAiCompatibleTransport.ts';

function promptFor(request: ScientificDiagramAnalysisRequest): string {
  return [
    'Tu es un assistant spécialisé dans l’évaluation de schémas scientifiques, en particulier biologiques, dans des copies universitaires.',
    'Analyse uniquement les dessins et schémas visibles dans les images originales jointes. Les images sont des pages de copie ; détecte chaque schéma et indique sa page.',
    'Évalue les dessins uniquement au regard de la question et du barème fournis. Ne note jamais l’esthétique pour elle-même. N’invente aucun attendu absent du barème.',
    'N’attribue des points qu’aux critères qui évaluent explicitement le schéma ou la représentation graphique. Ignore les critères purement textuels ; si aucun critère graphique n’existe, ne fabrique pas de note et signale cette limite.',
    'Distingue exactitude biologique, exhaustivité, organisation spatiale, légendes et conventions uniquement lorsque ces aspects sont demandés par le barème.',
    'Ne déduis jamais qu’un dessin est correct à partir d’une explication textuelle. Ne pénalise pas deux fois la même erreur.',
    'Si un élément est illisible, ambigu ou impossible à vérifier sur la photo, indique-le dans uncertainties et mets requiresTeacherReview à true. Ne devine pas.',
    'Les coordonnées bounds sont normalisées entre 0 et 1 par rapport à la page entière. Omet bounds si tu ne peux pas les estimer correctement.',
    'Pour chaque critère noté, utilise exclusivement un criterionId existant et respecte son maximum de points.',
    'Retourne exclusivement un JSON valide de la forme : {"diagrams":[{"id":"diagram-1","pageNumber":1,"bounds":{"x":0.1,"y":0.2,"width":0.5,"height":0.4},"diagramType":"...","summary":"...","criteria":[{"criterionId":"...","points":0,"evidence":"...","confidence":0.0,"requiresTeacherReview":true}],"uncertainties":[]}],"overallUncertainties":[]}.',
    'QUESTION :',
    request.question,
    'BARÈME (source de vérité, ne pas modifier) :',
    JSON.stringify(request.rubric),
    `NOMBRE DE PAGES : ${request.images.length}`,
  ].join('\n\n');
}

export function createOpenAiScientificDiagramAnalyzer(fetchImpl: typeof fetch = fetch): ScientificDiagramAnalyzer {
  return {
    async analyze(request) {
      const compatibleFetch = createOpenAiCompatibleFetch({ endpoint: request.endpoint, apiKey: request.apiKey }, fetchImpl);
      const response = await compatibleFetch(`${request.endpoint.replace(/\/+$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model,
          stream: false,
          format: 'json',
          generation_token_parameter: 'max_completion_tokens',
          options: { temperature: 0.1, num_predict: 4096 },
          messages: [{
            role: 'user',
            content: promptFor(request),
            images: request.images.map((image) => `data:${image.mimeType};base64,${image.base64}`),
          }],
        }),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        throw new Error(`L’analyse Vision des schémas a échoué (HTTP ${response.status}). ${detail}`);
      }
      const payload = await response.json() as { message?: { content?: string }; error?: string };
      if (payload.error) throw new Error(payload.error);
      if (!payload.message?.content?.trim()) throw new Error('Le modèle Vision n’a retourné aucune analyse.');
      return parseScientificDiagramAnalysis(payload.message.content, request.rubric, request.images.length);
    },
  };
}
