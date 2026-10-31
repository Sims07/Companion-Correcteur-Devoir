import { parseScientificDiagramAnalysis } from '../../domain/scientificDiagram.ts';
import { parseScientificPageClassifications } from '../../domain/scientificPageClassification.ts';
import type { ScientificDiagramAnalyzer, ScientificDiagramAnalysisRequest, ScientificPageClassificationRequest } from '../../ports/scientificDiagramAnalysis.ts';
import { createOpenAiCompatibleFetch } from './openAiCompatibleTransport.ts';

function classificationPrompt(originalPageNumber: number): string {
  return [
    'Tu es chargé de classer UNE SEULE page d’une copie universitaire de biologie avant toute correction.',
    'L’image jointe est la page indiquée ci-dessous. Ne fais aucune hypothèse sur les autres pages de la copie.',
    'Décide si CETTE page contient principalement une réponse rédigée, un schéma scientifique produit par l’étudiant, ou si le cas est ambigu.',
    'Un schéma scientifique est une représentation dessinée porteuse d’information scientifique : cellule, tissu, anatomie, coupe, cycle, voie métabolique, graphique scientifique, arbre phylogénétique, montage expérimental annoté, etc.',
    'Ne classe pas comme schéma les simples tableaux, formules isolées, décorations, pictogrammes ou illustrations imprimées du sujet. Une page mêlant texte et schéma doit être classée scientific-diagram si le schéma constitue une production à évaluer ; sinon ambiguous.',
    'Ne juge pas la qualité scientifique et n’attribue aucun point à cette étape. Cette étape sert uniquement à router cette page vers le bon parcours.',
    'Retourne exactement une entrée pour l’unique image jointe. Le champ pageNumber doit toujours valoir 1 dans cette réponse isolée.',
    'Retourne exclusivement un JSON valide : {"pages":[{"pageNumber":1,"kind":"text","confidence":0.0,"reason":"..."}]}',
    `NUMÉRO DE PAGE ORIGINAL : ${originalPageNumber}`,
  ].join('\\n\\n');
}

function promptFor(request: ScientificDiagramAnalysisRequest): string {
  return [
    'Tu es un assistant spécialisé dans l’évaluation de schémas scientifiques, en particulier biologiques, dans des copies universitaires.',
    'Analyse uniquement les dessins et schémas visibles dans les images originales jointes. Les images sont des pages de copie ; détecte chaque schéma et indique sa page.',
    'Évalue les dessins uniquement au regard de la question et du barème fournis. Ne note jamais l’esthétique pour elle-même. N’invente aucun attendu absent du barème.',
    'N’attribue des points qu’aux critères qui évaluent explicitement le schéma ou la représentation graphique. Ignore les critères purement textuels ; si aucun critère graphique n’existe, ne fabrique pas de note et signale cette limite.',
    'Distingue exactitude biologique, exhaustivité, organisation spatiale, légendes et conventions uniquement lorsque ces aspects sont demandés par le barème.',
    ...(request.rubric.criteria.some((criterion) => criterion.analysisMode === 'scientific-diagram') ? [
      'GRILLE AUTOMATIQUE DE QUALITÉ POUR LES CRITÈRES MARQUÉS « scientific-diagram » : pour chaque critère ainsi marqué, fournis obligatoirement un qualityBreakdown couvrant exactement les sept dimensions suivantes : title (titre et identification), scientific-accuracy (exactitude scientifique), completeness (exhaustivité et pertinence), labels (légendes et annotations), arrows-relations (flèches, sens et relations), organization-conventions (organisation spatiale et conventions scientifiques), legibility (lisibilité et soin).',
      'Pour chaque dimension, retourne un status parmi fulfilled, partial, missing, not-applicable, uncertain et une evidence concise, concrète et liée à ce qui est visible sur la copie. Utilise not-applicable lorsque la dimension ne convient pas au type de schéma (par exemple flèches pour un schéma sans relation à exprimer). Utilise uncertain si la photo ne permet pas de conclure.',
      'Cette grille explique la note du critère mais ne crée PAS de sous-notes ni de points supplémentaires : attribue une seule note globale au critère, comprise entre 0 et son maximum dans le barème. Pondère les dimensions selon leur pertinence scientifique et la consigne. Ne pénalise jamais l’absence d’un élément non pertinent ou non demandé, ni l’esthétique subjective.',
      'Ne pénalise pas deux fois une même erreur. La somme des sous-dimensions ne doit pas être calculée : le champ points reste la note globale du critère.',
    ] : []),
    'Ne déduis jamais qu’un dessin est correct à partir d’une explication textuelle. Ne pénalise pas deux fois la même erreur.',
    'Les annotations préexistantes de l’enseignant, si elles sont indiquées ci-dessous, ne font pas partie de la production de l’étudiant : ignore-les totalement pour détecter et noter les schémas.',
    'ANNOTATIONS ENSEIGNANT À EXCLURE :',
    request.teacherAnnotations?.trim() || 'Aucune annotation préexistante transmise. En cas de marque manuscrite ambiguë, signale une incertitude plutôt que de l’attribuer à l’étudiant.',
    'Si un élément est illisible, ambigu ou impossible à vérifier sur la photo, indique-le dans uncertainties et mets requiresTeacherReview à true. Ne devine pas.',
    'Les coordonnées bounds sont normalisées entre 0 et 1 par rapport à la page entière. Omet bounds si tu ne peux pas les estimer correctement.',
    'Les numéros de page correspondent aux numéros d’origine fournis ci-dessous, et non à l’index des images filtrées.',
    'Pour chaque critère noté, utilise exclusivement un criterionId existant et respecte son maximum de points.',
    'Retourne exclusivement un JSON valide de la forme : {"diagrams":[{"id":"diagram-1","pageNumber":1,"bounds":{"x":0.1,"y":0.2,"width":0.5,"height":0.4},"diagramType":"...","summary":"...","criteria":[{"criterionId":"...","points":0,"evidence":"...","confidence":0.0,"requiresTeacherReview":true,"qualityBreakdown":[{"dimension":"title","status":"fulfilled","evidence":"..."}]}],"uncertainties":[]}],"overallUncertainties":[]}. Le champ qualityBreakdown est obligatoire pour les critères marqués scientific-diagram et contient les sept dimensions ; il est omis pour les autres critères.',
    'QUESTION :',
    request.question,
    'BARÈME (source de vérité, ne pas modifier) :',
    JSON.stringify(request.rubric),
    `PAGES ORIGINALES DES IMAGES JOINTES : ${(request.pageNumbers ?? request.images.map((_, index) => index + 1)).join(', ')}`,
  ].join('\n\n');
}

export function createOpenAiScientificDiagramAnalyzer(fetchImpl: typeof fetch = fetch): ScientificDiagramAnalyzer {
  return {
    async classifyPages(request: ScientificPageClassificationRequest) {
      const compatibleFetch = createOpenAiCompatibleFetch({ endpoint: request.endpoint, apiKey: request.apiKey }, fetchImpl);
      const classifications = [];
      // Keep one image per request: this prevents cross-page attribution and makes page identity explicit.
      for (const [index, image] of request.images.entries()) {
        const response = await compatibleFetch(`${request.endpoint.replace(/\/+$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: request.model,
            stream: false,
            format: 'json',
            generation_token_parameter: 'max_tokens',
            options: { num_predict: 256 },
            messages: [{
              role: 'user',
              content: classificationPrompt(index + 1),
              imageDetail: 'low',
              images: [`data:${image.mimeType};base64,${image.base64}`],
            }],
          }),
        });
        if (!response.ok) {
          const detail = (await response.text()).slice(0, 500);
          throw new Error(`La détection Vision de la page ${index + 1} a échoué (HTTP ${response.status}). ${detail}`);
        }
        const payload = await response.json() as { message?: { content?: string }; error?: string };
        if (payload.error) throw new Error(`La détection Vision de la page ${index + 1} a échoué : ${payload.error}`);
        if (!payload.message?.content?.trim()) throw new Error(`Le modèle Vision n’a retourné aucune classification pour la page ${index + 1}.`);
        const [classification] = parseScientificPageClassifications(payload.message.content, 1);
        classifications.push({ ...classification, pageNumber: index + 1 });
      }
      return classifications;
    },
    async analyze(request) {
      const compatibleFetch = createOpenAiCompatibleFetch({ endpoint: request.endpoint, apiKey: request.apiKey }, fetchImpl);
      const response = await compatibleFetch(`${request.endpoint.replace(/\/+$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model,
          stream: false,
          format: 'json',
          generation_token_parameter: 'max_tokens',
          options: { num_predict: 2048 },
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
      return parseScientificDiagramAnalysis(payload.message.content, request.rubric, request.images.length, request.pageNumbers);
    },
  };
}
