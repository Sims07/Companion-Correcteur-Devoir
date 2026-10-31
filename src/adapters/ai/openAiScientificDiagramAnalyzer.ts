import { parseScientificDiagramAnalysis } from '../../domain/scientificDiagram.ts';
import { parseScientificPageClassifications } from '../../domain/scientificPageClassification.ts';
import type { ScientificDiagramAnalyzer, ScientificDiagramAnalysisRequest, ScientificPageClassificationRequest } from '../../ports/scientificDiagramAnalysis.ts';
import { createOpenAiCompatibleFetch } from './openAiCompatibleTransport.ts';
import type { DiagnosticModelResult, ImageInput } from '../../ports/aiProvider.ts';

function diagnosticResult(request: { model: string; endpoint: string; images: ImageInput[]; onDiagnosticResult?: (result: DiagnosticModelResult) => void }, purpose: DiagnosticModelResult['purpose'], prompt: string, raw: string, startedAt: number, error?: string): void {
  request.onDiagnosticResult?.({
    kind: 'vision',
    stage: 'reading',
    purpose,
    model: request.model,
    requestPrompt: prompt,
    requestMetadata: { provider: 'openai-compatible', endpoint: request.endpoint, stream: false, think: false, format: 'json', imageCount: request.images.length, keepAlive: 0, options: { contextTokens: 0, generationTokenLimit: purpose === 'scientific-diagram-classification' ? 256 : 2048 } },
    requestPayload: JSON.stringify({ attempts: [{ messages: [{ role: 'user', content: prompt }] }], imageCount: request.images.length, images: '[masquées]' }),
    raw,
    ...(error ? { error } : {}),
    elapsedMs: Math.max(0, Date.now() - startedAt),
  });
}

function classificationPrompt(originalPageNumber: number): string {
  return [
    'Tu es chargé de classer UNE SEULE page d’une copie universitaire de biologie avant toute correction.',
    'L’image jointe est la page indiquée ci-dessous. Ne fais aucune hypothèse sur les autres pages de la copie.',
    'Classe cette page selon son contenu réellement produit par l’étudiant. Les tableaux de données ou de comparaison structurés en lignes et colonnes ne sont PAS des schémas scientifiques : classe un tableau seul en text, même s’il contient des notions de biologie. Le modèle textuel sait exploiter les tableaux transcrits en Markdown.',
    'Un schéma scientifique est un dessin ou une représentation visuelle porteuse d’information scientifique : cellule dessinée, tissu, anatomie, coupe, cycle, voie métabolique dessinée, graphique avec axes/courbes, arbre phylogénétique, montage expérimental annoté.',
    'Si la page contient uniquement du texte et/ou un tableau, retourne kind=text. Si elle contient un véritable schéma scientifique sans tableau, retourne kind=scientific-diagram. Si elle contient à la fois un vrai schéma scientifique distinct ET un tableau ou une réponse rédigée, retourne kind=mixed : cette page sera envoyée au modèle textuel pour le texte/tableau ET à Vision pour le schéma uniquement. Si tu ne peux pas décider, retourne ambiguous.',
    'Ne confonds jamais un tableau, une liste, une formule isolée, des cases à compléter, un dessin décoratif ou une illustration imprimée du sujet avec un schéma scientifique produit par l’étudiant.',
    'Ne juge pas la qualité scientifique et n’attribue aucun point à cette étape. Cette étape sert uniquement à router cette page vers le bon parcours.',
    'Retourne exactement une entrée pour l’unique image jointe. Le champ pageNumber doit toujours valoir 1 dans cette réponse isolée.',
    'Les seules valeurs autorisées pour kind sont text, scientific-diagram, mixed ou ambiguous. Exemple de JSON valide : {"pages":[{"pageNumber":1,"kind":"text","confidence":0.0,"reason":"..."}]}',
    `NUMÉRO DE PAGE ORIGINAL : ${originalPageNumber}`,
  ].join('\n\n');
}

function promptFor(request: ScientificDiagramAnalysisRequest): string {
  return [
    'Tu es un assistant spécialisé dans l’évaluation de schémas scientifiques, en particulier biologiques, dans des copies universitaires.',
    'Analyse uniquement les dessins et schémas visibles dans les images originales jointes. Les images sont des pages de copie ; détecte chaque schéma et indique sa page.',
    'Tu reçois uniquement les critères du barème que le professeur a explicitement sélectionnés pour une évaluation visuelle. Leur présence dans ce barème filtré est l’instruction faisant autorité : évalue chacun d’eux sur l’image, même si son intitulé ne contient pas le mot schéma. N’ignore jamais un critère simplement parce que son intitulé est générique.',
    'Pour CHAQUE schéma détecté et pour CHAQUE critère fourni dans le barème ci-dessous, retourne obligatoirement une seule évaluation avec criterionId, points, evidence, confidence et requiresTeacherReview. Il faut une note globale chiffrée pour chaque critère ; ne retourne jamais criteria: [] lorsqu’un critère est fourni. Si la preuve est insuffisante, retourne 0 point, explique précisément pourquoi et mets requiresTeacherReview à true plutôt que d’omettre le critère.',
    'Évalue uniquement les dessins et représentations scientifiques réellement produits par l’étudiant. Les tableaux structurés en lignes et colonnes ne sont pas des schémas : ignore-les totalement dans cette analyse, même s’ils figurent sur la même page qu’un schéma. Ils sont traités par le parcours textuel/Markdown. N’évalue pas les tableaux avec Vision.',
    'Évalue les dessins au regard de la question et du barème fourni. Ne note jamais l’esthétique pour elle-même et n’invente aucun attendu absent de la consigne.',
    'Pour chaque critère marqué scientific-diagram, ajoute si possible un qualityBreakdown expliquant la note selon sept dimensions : title (titre et identification), scientific-accuracy (exactitude scientifique), completeness (exhaustivité et pertinence), labels (légendes et annotations), arrows-relations (flèches et relations), organization-conventions (organisation et conventions), legibility (lisibilité et soin).',
    'Le qualityBreakdown est un complément explicatif facultatif : il ne conditionne JAMAIS la validité de la note globale. Si une dimension ne s’applique pas, indique not-applicable ; si tu ne peux pas conclure, indique uncertain. La note points reste une seule note globale comprise entre 0 et le maximum du critère. Ne crée aucune sous-note.',
    'Ne pénalise pas deux fois la même erreur. Ne pénalise pas l’absence d’une flèche si aucune relation ne doit être représentée, ni l’absence d’un titre ou d’une légende lorsque la consigne ne l’exige pas.',
    'Ne déduis jamais qu’un dessin est correct à partir d’une explication textuelle. Ne pénalise pas deux fois la même erreur.',
    'Les annotations préexistantes de l’enseignant, si elles sont indiquées ci-dessous, ne font pas partie de la production de l’étudiant : ignore-les totalement pour détecter et noter les schémas.',
    'ANNOTATIONS ENSEIGNANT À EXCLURE :',
    request.teacherAnnotations?.trim() || 'Aucune annotation préexistante transmise. En cas de marque manuscrite ambiguë, signale une incertitude plutôt que de l’attribuer à l’étudiant.',
    'Si un élément est illisible, ambigu ou impossible à vérifier sur la photo, indique-le dans uncertainties et mets requiresTeacherReview à true. Ne devine pas.',
    'Les coordonnées bounds sont normalisées entre 0 et 1 par rapport à la page entière. Omet bounds si tu ne peux pas les estimer correctement.',
    'Le champ pageNumber doit obligatoirement être l’index de l’image dans le lot transmis, à partir de 1 (1 = première image jointe, 2 = deuxième image jointe, etc.). Ne retourne jamais le numéro de page original : l’application fera elle-même la correspondance avec la copie.',
    'Pour chaque critère noté, utilise exclusivement un criterionId existant et respecte son maximum de points.',
    `CRITÈRES VISUELS À NOTER (liste exhaustive, une note globale par critère) : ${JSON.stringify(request.rubric.criteria.map((criterion) => ({ criterionId: criterion.id, title: criterion.title, description: criterion.description, maxPoints: criterion.maxPoints })))}`,
    'Retourne exclusivement un JSON valide de la forme : {"diagrams":[{"id":"diagram-1","pageNumber":1,"bounds":{"x":0.1,"y":0.2,"width":0.5,"height":0.4},"diagramType":"...","summary":"...","criteria":[{"criterionId":"ID_EXISTANT","points":0,"evidence":"preuve visuelle précise","confidence":0.0,"requiresTeacherReview":true,"qualityBreakdown":[{"dimension":"title","status":"fulfilled","evidence":"..."}]}],"uncertainties":[]}],"overallUncertainties":[]}. qualityBreakdown peut être absent ou partiel ; criterionId, points, evidence, confidence et requiresTeacherReview sont obligatoires pour chaque critère.',
    'QUESTION :',
    request.question,
    'BARÈME (source de vérité, ne pas modifier) :',
    JSON.stringify(request.rubric),
    `CORRESPONDANCE INDEX LOCAL → PAGE ORIGINALE : ${(request.pageNumbers ?? request.images.map((_, index) => index + 1)).map((pageNumber, index) => `${index + 1} → ${pageNumber}`).join(', ')}`,
  ].join('\n\n');
}

export function createOpenAiScientificDiagramAnalyzer(fetchImpl: typeof fetch = fetch): ScientificDiagramAnalyzer {
  return {
    async classifyPages(request: ScientificPageClassificationRequest) {
      const compatibleFetch = createOpenAiCompatibleFetch({ endpoint: request.endpoint, apiKey: request.apiKey }, fetchImpl);
      const classifications = [];
      // Keep one image per request: this prevents cross-page attribution and makes page identity explicit.
      for (const [index, image] of request.images.entries()) {
        const prompt = classificationPrompt(index + 1);
        const startedAt = Date.now();
        let raw = '';
        try {
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
                content: prompt,
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
          raw = payload.message?.content ?? '';
          if (!raw.trim()) throw new Error(`Le modèle Vision n’a retourné aucune classification pour la page ${index + 1}.`);
          const [classification] = parseScientificPageClassifications(raw, 1);
          classifications.push({ ...classification, pageNumber: index + 1 });
          diagnosticResult(request, 'scientific-diagram-classification', prompt, raw, startedAt);
        } catch (cause) {
          diagnosticResult(request, 'scientific-diagram-classification', prompt, raw, startedAt, cause instanceof Error ? cause.message : String(cause));
          throw cause;
        }
      }
      return classifications;
    },
    async analyze(request) {
      const compatibleFetch = createOpenAiCompatibleFetch({ endpoint: request.endpoint, apiKey: request.apiKey }, fetchImpl);
      const prompt = promptFor(request);
      const startedAt = Date.now();
      let raw = '';
      try {
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
              content: prompt,
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
        raw = payload.message?.content ?? '';
        if (!raw.trim()) throw new Error('Le modèle Vision n’a retourné aucune analyse.');
        const result = parseScientificDiagramAnalysis(raw, request.rubric, request.images.length, request.pageNumbers);
        diagnosticResult(request, 'scientific-diagram-analysis', prompt, raw, startedAt);
        return result;
      } catch (cause) {
        diagnosticResult(request, 'scientific-diagram-analysis', prompt, raw, startedAt, cause instanceof Error ? cause.message : String(cause));
        throw cause;
      }
    },
  };
}
