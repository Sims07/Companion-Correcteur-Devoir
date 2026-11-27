import { DEFAULT_ZOOM_BUDGET, parseZoomBudget } from '../../domain/smartZoomBudget.ts';
import { responsesEndpoint } from '../../domain/lmStudioTransport.ts';
import { ResponsesOutput, responsesAtLimit, responsesMessage, responsesReasoning, type ResponsesOutputItem, type ResponsesPayload } from '../../domain/responsesOutput.ts';
import { ServerSentEvents } from '../../domain/serverSentEvents.ts';
import type { ImageInput } from '../../domain/imageInput.ts';
import { cropOriginalDiagram, validateZoomRegion, type ZoomRegion, type ZoomEvidence } from '../image/cropOriginalDiagram.ts';
import { copyNetworkRequestMetadata, type SmartZoomRequestDiagnostics } from '../../ports/networkRequestMetadata.ts';

export interface ZoomDiagramTurn {
  model: string;
  store?: boolean;
  stream?: boolean;
  criterionLabel?: string;
  zoomBudget?: number;
  messages: { content: string; images?: string[] }[];
  think: boolean | string;
  omitReasoningParameter?: boolean;
  options: { num_predict?: number; temperature?: number; top_p?: number; top_k?: number };
  format?: unknown;
}
export interface ZoomTrace { criterion: string; region: ZoomRegion; cropWidth: number; cropHeight: number; status: 'inspected' | 'rejected'; }
export interface ZoomConversation { responseId?: string; zoomHistory?: ZoomTrace[]; zoomAttempts?: Record<string, number>; zoomRejections?: Record<string, number> }

const MAX_REJECTIONS = 3;
const CONCLUDE = 'Termine maintenant à partir des observations disponibles, sans appeler d’outil. Produis la réponse finale demandée et signale les incertitudes sans inventer de preuve.';

const TOOL = {
  type: 'function',
  name: 'inspect_region',
  description: 'Inspecter une zone ambiguë de la copie originale en haute résolution. Appeler UNIQUEMENT si un détail visuel empêche de conclure, notamment un trait de rappel. Un trait sans pointe de flèche peut être correct. Les coordonnées sont des fractions entre 0 et 1 de la page entière.',
  parameters: {
    type: 'object',
    properties: {
      page: { type: 'integer', description: 'Numéro de page (commence à 1)' },
      x: { type: 'number', description: 'Bord gauche de la zone, entre 0 et 1' },
      y: { type: 'number', description: 'Bord supérieur de la zone, entre 0 et 1' },
      width: { type: 'number', description: 'Largeur relative de la zone, 0.04 à 0.8' },
      height: { type: 'number', description: 'Hauteur relative de la zone, 0.04 à 0.8' },
    },
    required: ['page', 'x', 'y', 'width', 'height'],
    additionalProperties: false,
  },
} as const;

async function readResponsesPayload(response: Response): Promise<ResponsesPayload & { streamedReasoning?: string }> {
  if (!/text\/event-stream/i.test(response.headers.get('content-type') ?? '')) {
    return await response.json() as ResponsesPayload;
  }
  if (!response.body) throw new Error('Flux LM Studio Responses absent.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const output = new ResponsesOutput();
  const events = new ServerSentEvents(data => {
    output.consume(JSON.parse(data));
    if (output.error) throw new Error(output.error);
  }, () => { throw new Error('Événement SSE LM Studio Responses trop volumineux.'); });
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      events.append(decoder.decode(value, { stream: true }));
    }
    events.append(decoder.decode());
    events.finish();
    if (!output.terminal) throw new Error('Flux LM Studio Responses interrompu avant la réponse finale.');
    return { ...output.reconcile(output.terminal), streamedReasoning: output.streamedReasoning };
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/** LM Studio supports text-only function_call_output but some builds reject multimodal
 * function outputs. We therefore return a text tool result AND a separate user input_image. */
export async function sendLmStudioZoomDiagramTurn(
  endpoint: string, apiKey: string, conversation: ZoomConversation, turn: ZoomDiagramTurn,
  originalImages: readonly ImageInput[], init: RequestInit, fetchImpl: typeof fetch,
  preview: (metadata: unknown) => void,
  onCrop?: (evidence: ZoomEvidence) => void,
  enableZoom = true,
): Promise<Response> {
  const url = responsesEndpoint(endpoint);
  if (!url) throw new Error('Adresse LM Studio Responses incompatible.');
  if (enableZoom && !originalImages.length) throw new Error('La photo originale est nécessaire au zoom intelligent.');
  const signal = init.signal ?? undefined;
  signal?.throwIfAborted();
  // Keep the cap across length retries and JSON repairs of the same criterion.
  const criterion = turn.criterionLabel ?? 'Barème complet';
  conversation.zoomAttempts ??= {};
  const attempts = conversation.zoomAttempts;
  const budget = parseZoomBudget(turn.zoomBudget) ?? DEFAULT_ZOOM_BUDGET;
  conversation.zoomRejections ??= {};
  const rejections = conversation.zoomRejections;
  let rejected = rejections[criterion] ?? 0;
  let concluding = false;
  let recovered = false;
  const reject = () => { rejected++; rejections[criterion] = rejected; };
  const firstImage = conversation.responseId
    ? [] : (turn.messages[0]?.images ?? []).map(image_url => ({ type: 'input_image', image_url }));
  const prompt = (turn.messages[0]?.content ?? '') +
    (turn.format ? '\nRéponds avec un JSON conforme à ce schéma :\n' + JSON.stringify(turn.format) : '') +
    (enableZoom ? `\nTu peux appeler inspect_region jusqu’à ${budget} fois pour CE critère. Ajuste ou élargis le cadre si nécessaire, mais ne redemande pas exactement la même zone. ` +
    'N’appelle pas cet outil lorsque tu peux déjà conclure. N’invente aucune connexion entre légende et structure. ' +
    'Si l’identification d’une structure biologique est incertaine, cadre la structure et les repères voisins utiles pour la distinguer, même sans légende. ' +
    'Si le zoom reste ambigu, indique que l’identification est incertaine. ' +
    'Si plusieurs dessins sont proches et que l’attribution d’une légende est ambiguë, cadre ensemble le dessin, le libellé et le trait de rappel entier. ' +
    'Si le trait sort du cadre ou si la légende est partagée, vérifie sur la vue d’ensemble et signale toute attribution encore incertaine. ' +
    'Après un zoom, interprète la nouvelle image dans le contexte de la page entière.' : '');
  let input: unknown[] = [{ role: 'user', content: [...firstImage, { type: 'input_text', text: prompt }] }];
  let previousId = conversation.responseId;
  let inspections = attempts[criterion] ?? 0;
  // Number of prepared crops included in the next request, not the whole history.
  let pendingCrops = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let total = 0;
  let text = '';

  for (let turnIndex = 0; turnIndex < budget + MAX_REJECTIONS + 2; turnIndex++) {
    signal?.throwIfAborted();
    const toolsAllowed = enableZoom && !concluding && inspections < budget && rejected < MAX_REJECTIONS;
    if (enableZoom && !toolsAllowed && !concluding) {
      concluding = true;
      input.push({ role: 'user', content: [{ type: 'input_text', text: CONCLUDE }] });
    }
    const zoomDiagnostics: SmartZoomRequestDiagnostics | undefined = enableZoom ? {
      used: inspections, budget, rejected, rejectionBudget: MAX_REJECTIONS,
      phase: recovered ? 'recovery' : toolsAllowed ? 'exploration' : inspections >= budget ? 'budget' : 'rejections',
    } : undefined;
    const body = {
      model: turn.model, stream: turn.stream ?? true, store: turn.store ?? true,
      ...(previousId ? { previous_response_id: previousId } : {}),
      input,
      ...(toolsAllowed ? { tools: [TOOL], tool_choice: 'auto' } : {}),
      ...(turn.options.num_predict !== undefined ? { max_output_tokens: turn.options.num_predict } : {}),
      ...(turn.options.temperature !== undefined ? { temperature: turn.options.temperature } : {}),
      ...(turn.options.top_p !== undefined ? { top_p: turn.options.top_p } : {}),
      // Responses has a different reasoning dialect from native Chat.
      ...(!turn.omitReasoningParameter ? { reasoning: { effort:
        !turn.think || turn.think === 'off' || turn.think === 'none' ? 'none' :
          turn.think === true || turn.think === 'on' ? 'medium' : turn.think } } : {}),
    };
    // Never persist copies or crops in the network request inspector.
    preview({ ...body, input: '[TEXT / IMAGE REDACTED]', tools: toolsAllowed ? ['inspect_region'] : [] });
    const responseStartedAt = performance.now();
    const response = await fetchImpl(url, copyNetworkRequestMetadata(init, {
      ...init,
      method: 'POST', headers: { 'Content-Type': 'application/json',
        ...(apiKey.trim() ? { Authorization: 'Bearer ' + apiKey.trim() } : {}) },
      body: JSON.stringify(body),
    }, Boolean(turn.format), zoomDiagnostics));
    if (!response.ok) return response;
    let payload: Awaited<ReturnType<typeof readResponsesPayload>>;
    try { payload = await readResponsesPayload(response); }
    catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (error instanceof SyntaxError) throw new Error('Réponse LM Studio Responses illisible.');
      throw error;
    }
    if ((turn.store !== false && !payload.id?.startsWith('resp_')) || (!Array.isArray(payload.output) && !payload.output_text?.trim() && payload.status !== 'incomplete')) {
      throw new Error('LM Studio n’a pas retourné de réponse Responses exploitable.');
    }
    // Record only completed, readable provider responses. A prepared crop
    // is not evidence that the model received or interpreted its pixels.
    if (enableZoom) preview({ smartZoomRound: {
      criterion, turn: turnIndex + 1, cropCount: pendingCrops,
      responseMs: Math.round(performance.now() - responseStartedAt),
      inputTokens: payload.usage?.input_tokens, outputTokens: payload.usage?.output_tokens,
    } });
    pendingCrops = 0;
    previousId = payload.id;
    totalInput += payload.usage?.input_tokens ?? 0;
    totalOutput += payload.usage?.output_tokens ?? 0;
    total += payload.usage?.total_tokens ?? 0;
    const calls = (payload.output ?? []).filter((item): item is Extract<ResponsesOutputItem, { type: 'function_call' }> => item.type === 'function_call');
    if (turn.store === false && calls.length) throw new Error('Réponse inattendue : le modèle a demandé un outil.');
    const incomplete = payload.status === 'incomplete';
    if (payload.status && payload.status !== 'completed' && !incomplete) {
      throw new Error('LM Studio Responses : réponse non terminée (' + payload.status + ').');
    }
    if (incomplete && payload.incomplete_details?.reason !== 'max_output_tokens') {
      throw new Error('LM Studio Responses : génération incomplète (' + (payload.incomplete_details?.reason ?? 'cause inconnue') + ').');
    }
    if (calls.length === 0 || incomplete) {
      text = responsesMessage(payload);
      const reasoning = responsesReasoning(payload) || payload.streamedReasoning;
      const atLimit = responsesAtLimit(payload, text, turn.options.num_predict);
      if (enableZoom && turn.store !== false && !atLimit && !text.trim() && !recovered && previousId?.startsWith('resp_')) {
        recovered = true;
        concluding = true;
        input = [{ role: 'user', content: [{ type: 'input_text', text: CONCLUDE }] }];
        continue;
      }
      // Never promote reasoning or truncated JSON to a final answer.
      if (turn.store !== false && text.trim() && !atLimit) conversation.responseId = previousId;
      const last = { message: { content: text, ...(reasoning ? { thinking: reasoning } : {}) },
        done: true, done_reason: atLimit ? 'length' : text.trim() ? 'stop' : 'no_verdict',
        provider_status: payload.status, reported_output_tokens: payload.usage?.output_tokens,
        reasoning_tokens: payload.usage?.output_tokens_details?.reasoning_tokens,
        prompt_eval_count: totalInput, eval_count: totalOutput, usage: { prompt_tokens: totalInput,
          completion_tokens: totalOutput, total_tokens: total || totalInput + totalOutput } };
      return new Response(JSON.stringify(last) + '\n', {
        status: response.status, headers: { 'Content-Type': 'application/x-ndjson' },
      });
    }
    const next: unknown[] = [];
    for (const call of calls) {
      const cropStartedAt = performance.now();
      if (!call.call_id) throw new Error('Appel de zoom sans identifiant.');
      if (!toolsAllowed || call.name !== 'inspect_region' || inspections >= budget || rejected >= MAX_REJECTIONS) {
        next.push({ type: 'function_call_output', call_id: call.call_id,
          output: 'Outil non autorisé ou budget d’inspection atteint. ' + CONCLUDE });
        if (toolsAllowed && call.name !== 'inspect_region' && rejected < MAX_REJECTIONS) reject();
        if (enableZoom && call.name === 'inspect_region') preview({ smartZoom: { criterion, status: 'rejected' } });
        continue;
      }
      try {
        const args = JSON.parse(call.arguments ?? '') as unknown;
        const region = validateZoomRegion(args, originalImages.length);
        if (conversation.zoomHistory?.some(trace => trace.criterion === criterion && trace.status === 'inspected' &&
          trace.region.page === region.page && (['x', 'y', 'width', 'height'] as const).every(key => Math.abs(trace.region[key] - region[key]) < 0.005))) {
          throw new Error('Zone déjà inspectée : ajuste ou élargis le cadre');
        }
        const evidence = await cropOriginalDiagram(originalImages[region.page - 1], region, signal);
        signal?.throwIfAborted();
        inspections++;
        pendingCrops++;
        attempts[criterion] = inspections;
        next.push({ type: 'function_call_output', call_id: call.call_id,
          output: 'La région demandée est jointe dans le message image suivant. Compare-la au dessin d’ensemble.' });
        next.push({ role: 'user', content: [
          { type: 'input_text', text: 'Recadrage haute résolution de la page ' + region.page +
            ' (zone x=' + region.x + ', y=' + region.y + ', largeur=' + region.width +
            ', hauteur=' + region.height + '). Inspecte le détail sans inventer de trait.' },
          { type: 'input_image', image_url: 'data:' + evidence.image.mimeType + ';base64,' + evidence.image.base64 },
        ] });
        onCrop?.(evidence);
        conversation.zoomHistory ??= [];
        conversation.zoomHistory.push({ criterion, region, cropWidth: evidence.cropWidth,
          cropHeight: evidence.cropHeight, status: 'inspected' });
        preview({ smartZoom: { criterion, region, cropWidth: evidence.cropWidth,
          cropHeight: evidence.cropHeight, status: 'inspected', cropMs: Math.round(performance.now() - cropStartedAt) } });
      } catch (error) {
        if (signal?.aborted) throw new DOMException('Zoom interrompu.', 'AbortError');
        reject();
        next.push({ type: 'function_call_output', call_id: call.call_id,
          output: 'Recadrage impossible : ' + (error instanceof Error ? error.message : 'zone incorrecte') +
            '. Choisis une autre zone si le budget le permet, sinon signale le doute.' });
        preview({ smartZoom: { criterion, status: 'rejected', cropMs: Math.round(performance.now() - cropStartedAt) } });
      }
    }
    if (!toolsAllowed) {
      if (recovered) throw new Error('LM Studio continue à demander des outils après le tour de conclusion.');
      recovered = true;
      concluding = true;
      next.push({ role: 'user', content: [{ type: 'input_text', text: CONCLUDE }] });
    }
    input = next;
  }
  throw new Error('La correction a dépassé la limite de tours des outils de zoom.');
}
