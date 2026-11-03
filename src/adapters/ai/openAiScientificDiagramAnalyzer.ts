import { parseScientificDiagramAnalysis } from '../../domain/scientificDiagram.ts';
import { parseScientificPageClassifications } from '../../domain/scientificPageClassification.ts';
import type { ScientificDiagramAnalyzer, ScientificDiagramAnalysisRequest, ScientificPageClassificationRequest } from '../../ports/scientificDiagramAnalysis.ts';
import { createOpenAiCompatibleFetch } from './openAiCompatibleTransport.ts';
import { currentFetch } from './currentFetch.ts';
import type { DiagnosticModelResult, ImageInput } from '../../ports/aiProvider.ts';
import { annotateNetworkRequest } from '../../ports/networkRequestMetadata.ts';

function diagnosticResult(request: { model: string; endpoint: string; images: ImageInput[]; apiCompatible?: boolean; onDiagnosticResult?: (result: DiagnosticModelResult) => void }, purpose: DiagnosticModelResult['purpose'], prompt: string, raw: string, startedAt: number, error?: string, requestPayload = ''): void {
  request.onDiagnosticResult?.({
    kind: 'vision',
    stage: 'reading',
    purpose,
    model: request.model,
    requestPrompt: prompt,
    requestMetadata: { provider: request.apiCompatible ? 'openai-compatible' : 'ollama', endpoint: request.endpoint, stream: false, think: false, format: 'json-schema', imageCount: request.images.length, keepAlive: 0, options: { contextTokens: 0, generationTokenLimit: purpose === 'scientific-diagram-classification' ? 1024 : 2048 } },
    requestPayload,
    raw,
    ...(error ? { error } : {}),
    elapsedMs: Math.max(0, Date.now() - startedAt),
  });
}

function classificationPrompt(pageNumber: number, previousRaw = ''): string {
  return [
    `RÔLE : Classer la page ${pageNumber} pour la détection des schémas et indiquer une éventuelle rotation horaire à appliquer à toute la page.`,
    ['kind=text : texte manuscrit, réponse rédigée, liste ou tableau de données ; kind=scientific-diagram : schéma scientifique dessiné par l’étudiant.','kind=mixed : schéma scientifique et texte/tableau présents ensemble.','kind=ambiguous : contenu impossible à classer avec confiance.'].join('\n'),
    ['FORMAT DE SORTIE','Réponds UNIQUEMENT par un objet JSON, sans texte avant ni après, sans Markdown.','Champs obligatoires : pageNumber (entier), kind (text | scientific-diagram | mixed | ambiguous), confidence (nombre de 0 à 1), reason (une phrase courte), suggestedRotation (0 | 90 | 180 | 270, rotation horaire à appliquer ; 0 si la page est droite ou en cas de doute), orientationConfidence (nombre de 0 à 1).','Un tableau seul est text. Ne propose une rotation non nulle que si toute la page est tournée ; ne tourne pas une page pour un dessin isolé en paysage. La rotation est indépendante du type de contenu et concerne toujours la page entière. Toute rotation est une suggestion à valider par le professeur.',...(previousRaw ? [`Réponse précédente à réparer : ${previousRaw.slice(0, 1500)}. Corrige le JSON sans inventer de contenu.`] : []),'Exemple neutre : {"pageNumber":1,"kind":"text","confidence":0.9,"reason":"texte manuscrit","suggestedRotation":0,"orientationConfidence":0.9}.'].join('\n'),
  ].join('\n\n');
}
function buildScientificPageClassificationSchema() {
  return { type: 'object', additionalProperties: false, required: ['pageNumber','kind','confidence','reason','suggestedRotation','orientationConfidence'], properties: {
    pageNumber: { type: 'integer', minimum: 1 }, kind: { type: 'string', enum: ['text','scientific-diagram','mixed','ambiguous'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 }, reason: { type: 'string' },
    suggestedRotation: { type: 'integer', enum: [0,90,180,270] }, orientationConfidence: { type: 'number', minimum: 0, maximum: 1 },
  } };
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
  const pageNumber = request.pageNumbers?.[0] ?? 1;
  const criteria = request.rubric.criteria.map((criterion) => ({
    criterionId: criterion.id,
    title: criterion.title,
    description: criterion.description,
    maxPoints: criterion.maxPoints,
    expectedElements: criterion.expectedElements ?? [],
  }));
  const subject = request.subjectTranscription?.trim();
  return [
    `Analyser les schémas de la page ${pageNumber} d’une copie universitaire. Une requête correspond toujours à une seule image ; un schéma est une preuve, jamais une unité de notation.`,
    'OBLIGATION : cette image provient d’une page déjà classée comme contenant un schéma scientifique. Ne retourne JAMAIS diagrams: [] ni criteria: []. Analyse cette page uniquement ; au moins un schéma doit être décrit. Si la page est réellement illisible, crée une entrée avec uncertainties explicites et requiresTeacherReview à true au lieu de l’omettre.',
    'Retourne diagrams : tous les schémas détectés sur cette page, avec id neutre, pageNumber = 1, diagramType, summary court, bounds et uncertainties (tableau). Le champ bounds est obligatoire : retourne null si la localisation est incertaine.',
    'Retourne criteria : exactement UNE évaluation pour CHAQUE critère du barème, portant sur l’ensemble des schémas pertinents de CETTE PAGE uniquement. Ne note jamais un critère séparément par schéma et ne répartis pas son maximum entre les schémas. Aucun critère ne doit être omis.',
    'Le maximum n’est justifié que si tous les attendus essentiels sont démontrés sur l’ensemble des schémas de cette page. Si un élément essentiel est partiel ou manquant, attribue des points partiels.',
    'Le champ elements est toujours présent : si expectedElements est non vide, retourne chaque élément avec son label exact, status parmi present/partial/absent/uncertain et une preuve courte ; sinon retourne null. L’application calcule les points (present 100 %, partial 50 %, absent 0 %, uncertain 0 % et vérification enseignante).',
    'Sans expectedElements, retourne une seule note points sur le maximum du critère, evidence, confidence, requiresTeacherReview et diagramIds pour cette page. Ne retourne jamais de critère absent du barème.',
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
    ['FORMAT DE SORTIE', 'Réponds UNIQUEMENT par un objet JSON, sans texte avant ni après, sans Markdown. Respecte le schéma JSON contraint transmis avec la requête. Les notes sont des nombres et restent dans les limites du barème ; n’invente aucune note.', 'Exemple neutre : {"diagrams":[{"id":"diagram-1","pageNumber":1,"diagramType":"schéma","summary":"Description courte.","uncertainties":[],"bounds":null}],"criteria":[{"criterionId":"criterion-id","points":0,"evidence":"Extrait exact.","confidence":0.5,"requiresTeacherReview":true,"diagramIds":[],"elements":null,"qualityBreakdown":null}],"overallUncertainties":[]}'].join('\n'),
  ].filter(Boolean).join('\n\n');
}

function buildScientificDiagramRepairPrompt(
  request: ScientificDiagramAnalysisRequest,
  reason: string,
  previousRaw: string,
): string {
  return [
    buildScientificDiagramPrompt(request, true),
    'Réparer la réponse d’analyse des schémas : la réponse précédente est invalide. Les listes diagrams et criteria ne peuvent pas être vides : cette image provient d’une page déjà classée comme contenant un schéma scientifique. Retourne au moins un schéma sur cette page et une évaluation pour chaque critère du barème.',
    'Corrige précisément ce champ : ' + reason + '.',
    'Réponse précédente (extrait) : ' + previousRaw.slice(0, 3000),
    'FORMAT DE SORTIE : réponds UNIQUEMENT par un objet JSON, sans texte avant ni après, sans Markdown. Retourne le JSON complet conforme au schéma. Exemple neutre : {"diagrams":[{"id":"diagram-1","pageNumber":1,"diagramType":"schéma","summary":"Description courte.","uncertainties":[],"bounds":null}],"criteria":[{"criterionId":"criterion-id","points":0,"evidence":"Extrait exact.","confidence":0.5,"requiresTeacherReview":true,"diagramIds":[],"elements":null,"qualityBreakdown":null}],"overallUncertainties":[]}.',
  ].join('\n\n');
}

export function createOpenAiScientificDiagramAnalyzer(fetchImpl: typeof fetch = currentFetch): ScientificDiagramAnalyzer {
  return {
    async classifyPages(request: ScientificPageClassificationRequest) {
      let requestPayload = '';
      const local = request.apiCompatible !== true;
      const compatibleFetch = local ? fetchImpl : createOpenAiCompatibleFetch({ endpoint: request.endpoint, apiKey: request.apiKey, onRequest: (payload) => { requestPayload = payload; } }, fetchImpl);
      const classifications = [];
      for (const [index, image] of request.images.entries()) {
        const prompt = classificationPrompt(index + 1), schema = buildScientificPageClassificationSchema(), startedAt = Date.now();
        let raw = '';
        try {
          const send = async (previousRaw = '') => {
            const content = previousRaw ? classificationPrompt(index + 1, previousRaw) : prompt;
            const body = {
              model: request.model,
              stream: false,
              ...(local ? { think: false, keep_alive: index < request.images.length - 1 ? '30s' : 0 } : { generation_token_parameter: 'max_tokens' as const }),
              format: schema,
              options: { temperature: 0, num_predict: 1024 },
              messages: [{ role: 'user', content, imageDetail: 'high' as const, images: [local ? image.base64 : 'data:' + image.mimeType + ';base64,' + image.base64] }],
            };
            if (local) requestPayload = JSON.stringify({ ...body, messages: body.messages.map((message) => ({ ...message, images: ['[IMAGE REDACTED]'] })) });
            const pageNumber = index + 1;
            const imageName = image.fileName?.trim();
            const context = `Modèle ${request.model} · page ${pageNumber}/${request.images.length}${imageName ? ` · ${imageName}` : ''}`;
            const response = await compatibleFetch(
              `${request.endpoint.replace(/\/+$/, '')}/api/chat`,
              annotateNetworkRequest(
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
                `Classer la page ${pageNumber} pour la détection des schémas`,
                context,
              ),
            );
            if (!response.ok) throw new Error(`La détection Vision de la page ${index + 1} a échoué (HTTP ${response.status}). ${(await response.text()).slice(0, 500)}`);
            const result = await response.json() as { message?: { content?: string }; choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; error?: string; done_reason?: string };
            if (result.error) throw new Error(result.error);
            raw = result.message?.content ?? result.choices?.[0]?.message?.content ?? '';
            return { truncated: (result.done_reason ?? result.choices?.[0]?.finish_reason) === 'length', content };
          };
          let attempt = await send();
          if (attempt.truncated) {
            attempt = await send(raw);
            if (attempt.truncated) throw new Error(`Réponse tronquée : la classification de la page ${index + 1} a atteint deux fois la limite de génération.`);
          }
          if (!raw.trim()) throw new Error(`Le modèle Vision n’a retourné aucune classification pour la page ${index + 1}.`);
          const [classification] = parseScientificPageClassifications(raw, 1);
          classifications.push({ ...classification, pageNumber: index + 1 });
          diagnosticResult(request, 'scientific-diagram-classification', attempt.content, raw, startedAt, undefined, requestPayload);
        } catch (cause) {
          diagnosticResult(request, 'scientific-diagram-classification', prompt, raw, startedAt, cause instanceof Error ? cause.message : String(cause), requestPayload);
          throw cause;
        }
      }
      return classifications;
    },
    async analyze(request) {
      let requestPayload = '';
      const local = request.apiCompatible !== true;
      const compatibleFetch = local ? fetchImpl : createOpenAiCompatibleFetch(
        { endpoint: request.endpoint, apiKey: request.apiKey, onRequest: (payload) => { requestPayload = payload; } },
        fetchImpl,
      );
      if (request.images.length !== 1) throw new Error('L’analyse Vision des schémas attend une seule image par requête. Les pages doivent être traitées séquentiellement.');
      const startedAt = Date.now();
      let raw = '';
      let prompt = buildScientificDiagramPrompt(request);

      const schema = buildScientificDiagramJsonSchema(request);

      const send = async (compact: boolean, promptOverride?: string) => {
        prompt = promptOverride ?? buildScientificDiagramPrompt(request, compact);
        const payload = {
          model: request.model,
          stream: false,
          ...(local ? { think: false, keep_alive: 0 } : { generation_token_parameter: 'max_tokens' as const }),
          options: { temperature: 0, num_predict: 2048 },
          messages: [{
            role: 'user',
            content: prompt,
            // Scientific drawing quality depends on retaining the highest available image detail.
            imageDetail: 'high',
            images: request.images.map((image) => local ? image.base64 : 'data:' + image.mimeType + ';base64,' + image.base64),
          }],
        };
        const post = (format: unknown) => {
          const body = JSON.stringify({ ...payload, format });
          if (local) requestPayload = JSON.stringify({ ...payload, images: ['[IMAGE REDACTED]'], format });
          return compatibleFetch(
          request.endpoint.replace(/\/+$/, '') + '/api/chat',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          },
        );
        };

        let response = await post(schema);
        if (!local && !response.ok && response.status === 400) {
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
          choices?: Array<{ finish_reason?: string }>;
        };
        if (payloadResult.error) throw new Error(payloadResult.error);
        raw = payloadResult.message?.content ?? '';
        if ((payloadResult.done_reason ?? payloadResult.choices?.[0]?.finish_reason) === 'length') return { truncated: true };
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
