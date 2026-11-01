import { parseScientificDiagramAnalysis } from '../../domain/scientificDiagram.ts';
import { parseScientificPageClassifications } from '../../domain/scientificPageClassification.ts';
import type { ScientificDiagramAnalyzer, ScientificDiagramAnalysisRequest, ScientificPageClassificationRequest } from '../../ports/scientificDiagramAnalysis.ts';
import { createOpenAiCompatibleFetch } from './openAiCompatibleTransport.ts';
import type { DiagnosticModelResult, ImageInput } from '../../ports/aiProvider.ts';

function diagnosticResult(request: { model: string; endpoint: string; images: ImageInput[]; onDiagnosticResult?: (result: DiagnosticModelResult) => void }, purpose: DiagnosticModelResult['purpose'], prompt: string, raw: string, startedAt: number, error?: string, requestPayload = ''): void {
  request.onDiagnosticResult?.({
    kind: 'vision',
    stage: 'reading',
    purpose,
    model: request.model,
    requestPrompt: prompt,
    requestMetadata: { provider: 'openai-compatible', endpoint: request.endpoint, stream: false, think: false, format: 'json', imageCount: request.images.length, keepAlive: 0, options: { contextTokens: 0, generationTokenLimit: purpose === 'scientific-diagram-classification' ? 320 : 2048 } },
    requestPayload,
    raw,
    ...(error ? { error } : {}),
    elapsedMs: Math.max(0, Date.now() - startedAt),
  });
}

function classificationPrompt(originalPageNumber: number): string {
  return [
    'Tu es chargé de classer UNE SEULE page d’une copie universitaire de biologie avant toute correction.',
    'L’image jointe est la page indiquée ci-dessous. Ne fais aucune hypothèse sur les autres pages de la copie.',
    'Détermine aussi l’orientation de lecture de la page : suggestedRotation est la rotation horaire à appliquer à l’image reçue (0, 90, 180 ou 270) pour rendre le contenu droit. Ne propose une rotation non nulle que si toute la page (texte, légendes et dessin) est clairement tournée ; ne tourne jamais une page portrait simplement parce qu’un dessin isolé est en paysage. Ne propose une rotation non nulle que si tu es très sûr que la page entière est de travers ; sinon retourne 0. orientationConfidence est une confiance indépendante, entre 0 et 1. En cas de doute, utilise 0 et une confiance faible.',
    'Classe cette page selon son contenu réellement produit par l’étudiant. Les tableaux de données ou de comparaison structurés en lignes et colonnes ne sont PAS des schémas scientifiques : classe un tableau seul en text, même s’il contient des notions de biologie. Le modèle textuel sait exploiter les tableaux transcrits en Markdown.',
    'Un schéma scientifique est un dessin ou une représentation visuelle porteuse d’information scientifique : cellule dessinée, tissu, anatomie, coupe, cycle, voie métabolique dessinée, graphique avec axes/courbes, arbre phylogénétique, montage expérimental annoté.',
    'Si la page contient uniquement du texte et/ou un tableau, retourne kind=text. Si elle contient un véritable schéma scientifique sans tableau, retourne kind=scientific-diagram. Si elle contient à la fois un vrai schéma scientifique distinct ET un tableau ou une réponse rédigée, retourne kind=mixed : cette page sera envoyée au modèle textuel pour le texte/tableau ET à Vision pour le schéma uniquement. Si tu ne peux pas décider, retourne ambiguous.',
    'Ne confonds jamais un tableau, une liste, une formule isolée, des cases à compléter, un dessin décoratif ou une illustration imprimée du sujet avec un schéma scientifique produit par l’étudiant.',
    'Ne juge pas la qualité scientifique et n’attribue aucun point à cette étape. Cette étape sert uniquement à router cette page vers le bon parcours.',
    'Retourne exactement une entrée pour l’unique image jointe. Le champ pageNumber doit toujours valoir 1 dans cette réponse isolée.',
    'Les seules valeurs autorisées pour kind sont text, scientific-diagram, mixed ou ambiguous. Retourne toujours suggestedRotation (0, 90, 180 ou 270) et orientationConfidence (0 à 1), même si tu ne proposes aucune rotation. Une rotation est une suggestion à valider par le professeur. Si l’option de rotation automatique est activée, l’application effectuera un second contrôle d’orientation avant de l’appliquer. Ne suggère jamais de rotation pour les pages mixed ou text. Exemple : {"pages":[{"pageNumber":1,"kind":"scientific-diagram","confidence":0.98,"reason":"...","suggestedRotation":90,"orientationConfidence":0.96}]}',
    `NUMÉRO DE PAGE ORIGINAL : ${originalPageNumber}`,
  ].join('\n\n');
}


function buildScientificDiagramJsonSchema(request: ScientificDiagramAnalysisRequest) {
  return {
      type: 'object',
      additionalProperties: false,
      required: ['diagrams', 'criteria', 'overallUncertainties'],
      properties: {
        diagrams: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'pageNumber', 'diagramType', 'summary', 'uncertainties', 'bounds'],
            properties: {
              id: { type: 'string' },
              pageNumber: { type: 'integer', minimum: 1 },
              diagramType: { type: 'string' },
              summary: { type: 'string' },
              uncertainties: { type: 'array', items: { type: 'string' } },
              bounds: {
                type: ['object', 'null'],
                additionalProperties: false,
                required: ['x', 'y', 'width', 'height'],
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  width: { type: 'number' },
                  height: { type: 'number' },
                },
              },
            },
          },
        },
        criteria: {
          type: 'array',
          minItems: request.rubric.criteria.length,
          maxItems: request.rubric.criteria.length,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['criterionId', 'points', 'evidence', 'confidence', 'requiresTeacherReview', 'diagramIds', 'elements', 'qualityBreakdown'],
            properties: {
              criterionId: { type: 'string', enum: request.rubric.criteria.map((criterion) => criterion.id) },
              points: { type: ['number', 'null'] },
              evidence: { type: 'string' },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              requiresTeacherReview: { type: 'boolean' },
              diagramIds: { type: 'array', items: { type: 'string' } },
              elements: {
                type: ['array', 'null'],
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['label', 'status', 'evidence'],
                  properties: {
                    label: { type: 'string' },
                    status: { type: 'string', enum: ['present', 'partial', 'absent', 'uncertain'] },
                    evidence: { type: 'string' },
                  },
                },
              },
              qualityBreakdown: {
                type: ['array', 'null'],
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['dimension', 'status'],
                  properties: {
                    dimension: { type: 'string' },
                    status: { type: 'string' },
                    evidence: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        overallUncertainties: { type: 'array', items: { type: 'string' } },
      },
    };
}

export function buildScientificDiagramPrompt(request: ScientificDiagramAnalysisRequest, compact = false): string {
  const criteria = request.rubric.criteria.map((criterion) => ({
    criterionId: criterion.id,
    title: criterion.title,
    description: criterion.description,
    maxPoints: criterion.maxPoints,
    expectedElements: criterion.expectedElements ?? [],
  }));
  const subject = request.subjectTranscription?.trim();
  return [
    'Tu évalues des schémas scientifiques universitaires. Un schéma est une preuve, jamais une unité de notation.',
    'OBLIGATION : ces images proviennent de pages déjà classées comme contenant un schéma scientifique. Ne retourne JAMAIS diagrams: [] ni criteria: []. Analyse chaque image jointe ; au moins un schéma doit être décrit pour chaque page transmise. Si une page est réellement illisible, crée une entrée avec uncertainties explicites et requiresTeacherReview à true au lieu de l’omettre.',
    'Retourne diagrams : tous les schémas détectés, avec id neutre, pageNumber (index local 1-based), diagramType, summary court, bounds et uncertainties (tableau). Le champ bounds est obligatoire : retourne null si la localisation est incertaine.',
    'Retourne criteria : exactement UNE évaluation pour CHAQUE critère du barème, portant sur l’ensemble des schémas pertinents. Ne note jamais un critère séparément par schéma et ne répartis pas son maximum entre les schémas. Aucun critère ne doit être omis.',
    'Le maximum n’est justifié que si tous les attendus essentiels sont démontrés sur l’ensemble des schémas concernés. Si un élément essentiel est partiel ou manquant, attribue des points partiels.',
    'Le champ elements est toujours présent : si expectedElements est non vide, retourne chaque élément avec son label exact, status parmi present/partial/absent/uncertain et une preuve courte ; sinon retourne null. L’application calcule les points (present 100 %, partial 50 %, absent 0 %, uncertain 0 % et vérification enseignante).',
    'Sans expectedElements, retourne une seule note points sur le maximum du critère, evidence, confidence, requiresTeacherReview et diagramIds. Ne retourne jamais de critère absent du barème.',
    'Ne pénalise pas deux fois la même erreur. Ne note jamais l’esthétique. N’invente aucun attendu absent de la consigne ou du barème.',
    'Ne juge jamais un dessin correct à partir d’une explication textuelle. Si un élément est illisible ou ambigu, signale-le dans uncertainties et mets requiresTeacherReview à true.',
    'Ne pénalise pas l’absence d’une flèche, d’un titre ou d’une légende qui ne sont pas exigés par la consigne ou le barème.',
    'Le champ qualityBreakdown est toujours présent : retourne null si aucune précision utile, sinon uniquement les dimensions non satisfaites, avec status et 12 mots maximum. Dimensions : title, scientific-accuracy, completeness, labels, arrows-relations, organization-conventions, legibility.',
    'Les bounds sont normalisées de 0 à 1. Omet-les si incertain. Ne considère pas les tableaux de données comme des schémas.',
    'Ignore les marques de correction manuscrites préexistantes (commentaires, coches, cercles, notes et traits) : elles ne font jamais partie de la production de l’étudiant. Si une marque recouvre ou touche un élément du schéma, mets requiresTeacherReview à true.',
    'CRITÈRES VISUELS (liste exhaustive) : ' + JSON.stringify(criteria),
    'QUESTION : ' + (request.question.trim() || 'Aucune question de référence fournie.'),
    ...(subject ? ['SUJET DE RÉFÉRENCE (transcription fournie) : ' + subject] : []),
    'CORRESPONDANCE DES PAGES : ' + (request.pageNumbers ?? request.images.map((_, index) => index + 1)).map((page, index) => (index + 1) + ' → ' + page).join(', '),
    compact ? 'Réponse compacte obligatoire : aucun qualityBreakdown.' : '',
    'SCHÉMA JSON À RESPECTER STRICTEMENT (généré depuis le même schéma que celui utilisé pour contraindre la réponse) : ' + JSON.stringify(buildScientificDiagramJsonSchema(request)),
  ].filter(Boolean).join('\n\n');
}

function buildScientificDiagramRepairPrompt(
  request: ScientificDiagramAnalysisRequest,
  reason: string,
  previousRaw: string,
): string {
  return [
    buildScientificDiagramPrompt(request, true),
    'CORRECTION OBLIGATOIRE : la réponse précédente est invalide. Les listes diagrams et criteria ne peuvent pas être vides : les pages transmises ont déjà été classées comme contenant des schémas scientifiques. Retourne au moins un schéma pour chaque page et une évaluation pour chaque critère du barème.',
    'Corrige précisément ce champ : ' + reason + '.',
    'Réponse précédente (extrait) : ' + previousRaw.slice(0, 3000),
    'Retourne le JSON complet, sans qualityBreakdown.',
  ].join('\n\n');
}

export function createOpenAiScientificDiagramAnalyzer(fetchImpl: typeof fetch = fetch): ScientificDiagramAnalyzer {
  return {
    async classifyPages(request: ScientificPageClassificationRequest) {
      let requestPayload = '';
      const compatibleFetch = createOpenAiCompatibleFetch({ endpoint: request.endpoint, apiKey: request.apiKey, onRequest: (payload) => { requestPayload = payload; } }, fetchImpl);
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
              options: { num_predict: 320 },
              messages: [{
                role: 'user',
                content: prompt,
                imageDetail: 'high',
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
          diagnosticResult(request, 'scientific-diagram-classification', prompt, raw, startedAt, undefined, requestPayload);
        } catch (cause) {
          diagnosticResult(request, 'scientific-diagram-classification', prompt, raw, startedAt, cause instanceof Error ? cause.message : String(cause), requestPayload);
          throw cause;
        }
      }
      return classifications;
    },
    async analyze(request) {
      const compatibleFetch = createOpenAiCompatibleFetch(
        { endpoint: request.endpoint, apiKey: request.apiKey },
        fetchImpl,
      );
      const startedAt = Date.now();
      let raw = '';
      let prompt = buildScientificDiagramPrompt(request);

      const schema = buildScientificDiagramJsonSchema(request);

      const send = async (compact: boolean, promptOverride?: string) => {
        prompt = promptOverride ?? buildScientificDiagramPrompt(request, compact);
        const payload = {
          model: request.model,
          stream: false,
          generation_token_parameter: 'max_tokens',
          options: { num_predict: 2048 },
          messages: [{
            role: 'user',
            content: prompt,
            // Scientific drawing quality depends on retaining the highest available image detail.
            imageDetail: 'high',
            images: request.images.map((image) => 'data:' + image.mimeType + ';base64,' + image.base64),
          }],
        };
        const post = (format: unknown) => compatibleFetch(
          request.endpoint.replace(/\/+$/, '') + '/api/chat',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, format }),
          },
        );

        let response = await post(schema);
        if (!response.ok && response.status === 400) {
          const detail = (await response.text()).slice(0, 500);
          if (/format|schema|json.?schema|unsupported/i.test(detail)) {
            response = await post('json_object');
          } else {
            throw new Error('L’analyse Vision des schémas a échoué (HTTP ' + response.status + '). ' + detail);
          }
        }
        if (!response.ok) {
          throw new Error('L’analyse Vision des schémas a échoué (HTTP ' + response.status + '). ' + (await response.text()).slice(0, 500));
        }

        const payloadResult = await response.json() as {
          message?: { content?: string };
          error?: string;
          done_reason?: string;
        };
        if (payloadResult.error) throw new Error(payloadResult.error);
        raw = payloadResult.message?.content ?? '';
        if (payloadResult.done_reason === 'length') return { truncated: true };
        if (!raw.trim()) throw new Error('Le modèle Vision n’a retourné aucune analyse.');
        return { truncated: false };
      };

      try {
        let attempt = await send(false);
        if (attempt.truncated) {
          attempt = await send(true);
          if (attempt.truncated) {
            throw new Error('Réponse tronquée : la seconde tentative compacte a également atteint la limite de génération.');
          }
        }

        let result: ReturnType<typeof parseScientificDiagramAnalysis>;
        try {
          result = parseScientificDiagramAnalysis(raw, request.rubric, request.images.length, request.pageNumbers);
        } catch (firstError) {
          const reason = firstError instanceof Error ? firstError.message : String(firstError);
          diagnosticResult(request, 'scientific-diagram-analysis', prompt, raw, startedAt, reason, requestPayload);
          const repairPrompt = buildScientificDiagramRepairPrompt(request, reason, raw);
          const repair = await send(true, repairPrompt);
          if (repair.truncated) throw new Error('Réponse tronquée lors de la tentative de réparation.');

          try {
            result = parseScientificDiagramAnalysis(raw, request.rubric, request.images.length, request.pageNumbers);
          } catch (secondError) {
            const detail = secondError instanceof Error ? secondError.message : String(secondError);
            throw new Error(detail + ' Extrait de la réponse brute : ' + raw.slice(0, 500));
          }
        }

        diagnosticResult(request, 'scientific-diagram-analysis', prompt, raw, startedAt, undefined, requestPayload);
        return result;
      } catch (cause) {
        diagnosticResult(
          request,
          'scientific-diagram-analysis',
          prompt,
          raw,
          startedAt,
          cause instanceof Error ? cause.message : String(cause),
          requestPayload,
        );
        throw cause;
      }
    }
  };
}
