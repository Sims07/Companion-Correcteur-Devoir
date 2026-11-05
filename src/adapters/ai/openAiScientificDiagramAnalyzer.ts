import { classificationPrompt, buildScientificDiagramPrompt, buildScientificDiagramRepairPrompt, buildConciseScientificDiagramPrompt } from './prompts/scientificDiagramPrompts.ts';
export { buildScientificDiagramPrompt } from './prompts/scientificDiagramPrompts.ts';
import { parseScientificDiagramAnalysis } from '../../domain/scientificDiagram.ts';
import { parseScientificPageClassifications } from '../../domain/scientificPageClassification.ts';
import type { ScientificDiagramAnalyzer, ScientificDiagramAnalysisRequest, ScientificPageClassificationRequest } from '../../ports/scientificDiagramAnalysis.ts';
import { createOpenAiCompatibleFetch } from './openAiCompatibleTransport.ts';
import { currentFetch } from './currentFetch.ts';
import type { DiagnosticModelResult, ImageInput } from '../../ports/aiProvider.ts';
import { annotateNetworkRequest } from '../../ports/networkRequestMetadata.ts';

function diagnosticResult(request: { model: string; endpoint: string; images: ImageInput[]; apiCompatible?: boolean; onDiagnosticResult?: (result: DiagnosticModelResult) => void }, purpose: DiagnosticModelResult['purpose'], prompt: string, raw: string, startedAt: number, error?: string, requestPayload = ''): void {
  if (!request.onDiagnosticResult) return;
  // Derive actual options from the already-redacted wire preview, including a
  // provider's JSON-object fallback, rather than reporting guessed settings.
  let effective: {
    format?: unknown; response_format?: { type?: string };
    options?: { num_ctx?: number; num_predict?: number; temperature?: number };
    max_tokens?: number; max_completion_tokens?: number;
  } = {};
  try { effective = JSON.parse(requestPayload) as typeof effective; } catch { /* Unavailable after a network error. */ }
  const jsonObject = effective.format === 'json_object' || effective.format === 'json'
    || effective.response_format?.type === 'json_object';
  const generationTokenLimit = effective.options?.num_predict
    ?? effective.max_tokens ?? effective.max_completion_tokens
    ?? (purpose === 'scientific-diagram-classification' ? 1024 : 2048);
  request.onDiagnosticResult({
    kind: 'vision',
    stage: 'reading',
    purpose,
    model: request.model,
    requestPrompt: prompt,
    requestMetadata: {
      provider: request.apiCompatible ? 'openai-compatible' : 'ollama',
      endpoint: request.endpoint,
      stream: false,
      think: false,
      format: jsonObject ? 'json' : 'json-schema',
      imageCount: request.images.length,
      keepAlive: request.apiCompatible ? 'non applicable' : '5m (Ollama default)',
      options: {
        contextTokens: effective.options?.num_ctx ?? 0,
        generationTokenLimit,
        ...(effective.options?.temperature !== undefined ? { temperature: effective.options.temperature } : {}),
      },
    },
    requestPayload,
    raw,
    ...(error ? { error } : {}),
    elapsedMs: Math.max(0, Date.now() - startedAt),
  });
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
          minItems: 0,
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
          minItems: 0,
          maxItems: request.rubric.criteria.length,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['criterionId', 'points', 'evidence', 'confidence', 'requiresTeacherReview', 'diagramIds', 'elements'],
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
                  required: ['label', 'status', 'evidence', 'points'],
                  properties: {
                    label: { type: 'string' },
                    status: { type: 'string', enum: ['present', 'partial', 'absent', 'uncertain'] },
                    evidence: { type: 'string' },
                    points: { type: 'number', minimum: 0 },
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

export function createOpenAiScientificDiagramAnalyzer(fetchImpl: typeof fetch = currentFetch): ScientificDiagramAnalyzer {
  return {
    async classifyPages(request: ScientificPageClassificationRequest) {
      let requestPayload = '';
      const local = request.apiCompatible !== true;
      const compatibleFetch = local ? fetchImpl : createOpenAiCompatibleFetch({ endpoint: request.endpoint, apiKey: request.apiKey, onRequest: (payload) => { requestPayload = payload; } }, fetchImpl);
      const classifications = [];
      for (const [index, image] of request.images.entries()) {
        if (request.signal?.aborted) throw new DOMException('Traitement interrompu.', 'AbortError');
        const prompt = classificationPrompt(index + 1), schema = buildScientificPageClassificationSchema(), startedAt = Date.now();
        let lastRequestStartedAt = startedAt;
        let raw = '';
        try {
          const send = async (repair?: { raw: string; reason: string }) => {
            lastRequestStartedAt = Date.now();
            const content = repair ? classificationPrompt(index + 1, repair.raw, repair.reason) : prompt;
            const body = {
              model: request.model,
              stream: false,
              ...(local ? { think: false } : { generation_token_parameter: 'max_tokens' as const }),
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
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: request.signal },
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
          let classification: ReturnType<typeof parseScientificPageClassifications>[number];
          try {
            if (attempt.truncated) throw new Error('Réponse tronquée : limite de génération atteinte.');
            if (!raw.trim()) throw new Error('Réponse vide.');
            [classification] = parseScientificPageClassifications(raw, 1);
          } catch (cause) {
            const reason = cause instanceof Error ? cause.message : String(cause);
            diagnosticResult(request, 'scientific-diagram-classification', attempt.content, raw, lastRequestStartedAt, reason, requestPayload);
            // A malformed JSON, empty output or truncation warrants one targeted repair.
            // HTTP/provider failures are not handled here and never trigger retries.
            attempt = await send({ raw, reason });
            if (attempt.truncated) throw new Error(`Réponse tronquée : la classification de la page ${index + 1} a atteint deux fois la limite de génération.`);
            if (!raw.trim()) throw new Error(`Le modèle Vision n’a retourné aucune classification pour la page ${index + 1} après réparation.`);
            [classification] = parseScientificPageClassifications(raw, 1);
          }
          classifications.push({ ...classification, pageNumber: index + 1 });
          diagnosticResult(request, 'scientific-diagram-classification', attempt.content, raw, lastRequestStartedAt, undefined, requestPayload);
        } catch (cause) {
          diagnosticResult(request, 'scientific-diagram-classification', prompt, raw, lastRequestStartedAt, cause instanceof Error ? cause.message : String(cause), requestPayload);
          throw cause;
        }
      }
      return classifications;
    },
    async analyze(request) {
      if (request.signal?.aborted) throw new DOMException('Traitement interrompu.', 'AbortError');
      let requestPayload = '';
      const local = request.apiCompatible !== true;
      const compatibleFetch = local ? fetchImpl : createOpenAiCompatibleFetch(
        { endpoint: request.endpoint, apiKey: request.apiKey, onRequest: (payload) => { requestPayload = payload; } },
        fetchImpl,
      );
      if (request.images.length !== 1) throw new Error('L’analyse Vision des schémas attend une seule image par requête. Les pages doivent être traitées séquentiellement.');
      const startedAt = Date.now();
      let lastRequestStartedAt = startedAt;
      let raw = '';
      let prompt = buildScientificDiagramPrompt(request);

      const schema = buildScientificDiagramJsonSchema(request);

      const send = async (promptOverride?: string) => {
        lastRequestStartedAt = Date.now();
        prompt = promptOverride ?? buildScientificDiagramPrompt(request);
        const payload = {
          model: request.model,
          stream: false,
          ...(local ? { think: false } : { generation_token_parameter: 'max_tokens' as const }),
          options: { temperature: 0, num_predict: 2048, ...(local ? { num_ctx: 8192 } : {}) },
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
          if (local) requestPayload = JSON.stringify({
            ...payload,
            format,
            messages: payload.messages.map((message) => ({ ...message, images: message.images.map(() => '[IMAGE REDACTED]') })),
          });
          return compatibleFetch(
          request.endpoint.replace(/\/+$/, '') + '/api/chat',
          annotateNetworkRequest(
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: request.signal },
            'Analyser les schémas scientifiques',
            `Modèle ${request.model} · page ${request.pageNumbers?.[0] ?? 1}/${request.totalPageCount ?? 1}`,
          ),
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
        let attempt = await send();
        let truncatedRetry = false;
        if (attempt.truncated) {
          diagnosticResult(request, 'scientific-diagram-analysis', prompt, raw, lastRequestStartedAt, 'Réponse tronquée : limite de génération atteinte.', requestPayload);
          truncatedRetry = true;
          // Exactly one shorter retry: never send the same oversized prompt twice.
          attempt = await send(buildConciseScientificDiagramPrompt(request));
          if (attempt.truncated) {
            throw new Error('Réponse tronquée après une tentative allégée d’analyse du schéma.');
          }
        }

        let result: ReturnType<typeof parseScientificDiagramAnalysis>;
        try {
          result = parseScientificDiagramAnalysis(raw, request.rubric, request.images.length, request.pageNumbers);
        } catch (firstError) {
          const reason = firstError instanceof Error ? firstError.message : String(firstError);
          if (truncatedRetry) throw new Error('Réponse invalide après tentative allégée : ' + reason);
          diagnosticResult(request, 'scientific-diagram-analysis', prompt, raw, lastRequestStartedAt, reason, requestPayload);
          const repairPrompt = buildScientificDiagramRepairPrompt(request, reason, raw);
          const repair = await send(repairPrompt);
          if (repair.truncated) throw new Error('Réponse tronquée lors de la tentative de réparation.');

          try {
            result = parseScientificDiagramAnalysis(raw, request.rubric, request.images.length, request.pageNumbers);
          } catch (secondError) {
            const detail = secondError instanceof Error ? secondError.message : String(secondError);
            throw new Error(detail + ' Extrait de la réponse brute : ' + raw.slice(0, 500));
          }
        }

        diagnosticResult(request, 'scientific-diagram-analysis', prompt, raw, lastRequestStartedAt, undefined, requestPayload);
        return result;
      } catch (cause) {
        diagnosticResult(
          request,
          'scientific-diagram-analysis',
          prompt,
          raw,
          lastRequestStartedAt,
          cause instanceof Error ? cause.message : String(cause),
          requestPayload,
        );
        throw cause;
      }
    }
  };
}
