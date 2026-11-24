import { responsesEndpoint } from '../../domain/lmStudioTransport.ts';
import type { ImageInput } from '../../domain/imageInput.ts';
import { cropOriginalDiagram, validateZoomRegion, type ZoomRegion, type ZoomEvidence } from '../image/cropOriginalDiagram.ts';
import { copyNetworkRequestMetadata } from '../../ports/networkRequestMetadata.ts';

export interface ZoomDiagramTurn {
  model: string;
  criterionLabel?: string;
  messages: { content: string; images?: string[] }[];
  think: boolean | string;
  omitReasoningParameter?: boolean;
  options: { num_predict?: number; temperature?: number; top_p?: number; top_k?: number };
  format?: unknown;
}
export interface ZoomTrace { criterion: string; region: ZoomRegion; cropWidth: number; cropHeight: number; status: 'inspected' | 'rejected'; }
export interface ZoomConversation { responseId?: string; zoomHistory?: ZoomTrace[]; zoomAttempts?: Record<string, number> }

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

type ApiOutput =
  | { type: 'function_call'; name?: string; call_id?: string; arguments?: string }
  | { type: 'message'; content?: Array<{ type?: string; text?: string }> }
  | { type: 'reasoning'; content?: Array<{ type?: string; text?: string }> };
interface ApiResponse {
  id?: string;
  output?: ApiOutput[];
  output_text?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
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
  const firstImage = conversation.responseId
    ? [] : (turn.messages[0]?.images ?? []).map(image_url => ({ type: 'input_image', image_url }));
  const prompt = (turn.messages[0]?.content ?? '') +
    (turn.format ? '\nRéponds avec un JSON conforme à ce schéma :\n' + JSON.stringify(turn.format) : '') +
    (enableZoom ? '\nTu peux appeler inspect_region pour vérifier au maximum deux détails ambigus de CE critère. ' +
    'N’appelle pas cet outil lorsque tu peux déjà conclure. N’invente aucune connexion entre légende et structure. ' +
    'Si l’identification d’une structure biologique est incertaine, cadre la structure et les repères voisins utiles pour la distinguer, même sans légende. ' +
    'Si le zoom reste ambigu, indique que l’identification est incertaine. ' +
    'Si plusieurs dessins sont proches et que l’attribution d’une légende est ambiguë, cadre ensemble le dessin, le libellé et le trait de rappel entier. ' +
    'Si le trait sort du cadre ou si la légende est partagée, vérifie sur la vue d’ensemble et signale toute attribution encore incertaine. ' +
    'Après un zoom, interprète la nouvelle image dans le contexte de la page entière.' : '');
  let input: unknown[] = [{ role: 'user', content: [...firstImage, { type: 'input_text', text: prompt }] }];
  let previousId = conversation.responseId;
  let inspections = attempts[criterion] ?? 0;
  let totalInput = 0;
  let totalOutput = 0;
  let total = 0;
  let text = '';

  for (let turnIndex = 0; turnIndex < 5; turnIndex++) {
    signal?.throwIfAborted();
    const body = {
      model: turn.model, stream: false, store: true,
      ...(previousId ? { previous_response_id: previousId } : {}),
      input,
      ...(enableZoom && inspections < 2 ? { tools: [TOOL], tool_choice: 'auto' } : {}),
      ...(turn.options.num_predict !== undefined ? { max_output_tokens: turn.options.num_predict } : {}),
      ...(turn.options.temperature !== undefined ? { temperature: turn.options.temperature } : {}),
      ...(turn.options.top_p !== undefined ? { top_p: turn.options.top_p } : {}),
      // Responses has a different reasoning dialect from native Chat.
      ...(!turn.omitReasoningParameter ? { reasoning: { effort:
        !turn.think || turn.think === 'off' || turn.think === 'none' ? 'none' :
          turn.think === true || turn.think === 'on' ? 'medium' : turn.think } } : {}),
    };
    // Never persist copies or crops in the network request inspector.
    preview({ ...body, input: '[TEXT / IMAGE REDACTED]', tools: enableZoom && inspections < 2 ? ['inspect_region'] : [] });
    const response = await fetchImpl(url, copyNetworkRequestMetadata(init, {
      ...init,
      method: 'POST', headers: { 'Content-Type': 'application/json',
        ...(apiKey.trim() ? { Authorization: 'Bearer ' + apiKey.trim() } : {}) },
      body: JSON.stringify(body),
    }));
    if (!response.ok) return response;
    let payload: ApiResponse;
    try { payload = await response.json() as ApiResponse; }
    catch { throw new Error('Réponse LM Studio Responses illisible.'); }
    if (!payload.id || !payload.id.startsWith('resp_') || !Array.isArray(payload.output)) {
      throw new Error('LM Studio n’a pas retourné de réponse Responses exploitable.');
    }
    previousId = payload.id;
    totalInput += payload.usage?.input_tokens ?? 0;
    totalOutput += payload.usage?.output_tokens ?? 0;
    total += payload.usage?.total_tokens ?? 0;
    const calls = payload.output.filter((item): item is Extract<ApiOutput, { type: 'function_call' }> => item.type === 'function_call');
    const incomplete = payload.status === 'incomplete';
    if (payload.status && payload.status !== 'completed' && !incomplete) {
      throw new Error('LM Studio Responses : réponse non terminée (' + payload.status + ').');
    }
    if (incomplete && payload.incomplete_details?.reason !== 'max_output_tokens') {
      throw new Error('LM Studio Responses : génération incomplète (' + (payload.incomplete_details?.reason ?? 'cause inconnue') + ').');
    }
    if (calls.length === 0 || incomplete) {
      const messageText = payload.output.filter((item): item is Extract<ApiOutput, { type: 'message' }> => item.type === 'message')
        .flatMap(item => item.content ?? []).filter(item => item.type === 'output_text' || item.type === 'text')
        .map(item => item.text ?? '').join('');
      text = payload.output_text?.trim() ? payload.output_text : messageText;
      const reasoning = payload.output.filter((item): item is Extract<ApiOutput, { type: 'reasoning' }> => item.type === 'reasoning')
        .flatMap(item => item.content ?? []).filter(item => item.type === 'reasoning_text')
        .map(item => item.text ?? '').join('');
      const atLimit = incomplete || (!text.trim() && turn.options.num_predict !== undefined &&
        (payload.usage?.output_tokens ?? 0) >= turn.options.num_predict);
      // Never promote reasoning or truncated JSON to a final answer.
      if (text.trim() && !atLimit) conversation.responseId = previousId;
      const last = { message: { content: text, ...(reasoning ? { thinking: reasoning } : {}) },
        done: true, done_reason: atLimit ? 'length' : 'stop',
        prompt_eval_count: totalInput, eval_count: totalOutput, usage: { prompt_tokens: totalInput,
          completion_tokens: totalOutput, total_tokens: total || totalInput + totalOutput } };
      return new Response(JSON.stringify(last) + '\n', {
        status: 200, headers: { 'Content-Type': 'application/x-ndjson' },
      });
    }
    const next: unknown[] = [];
    for (const call of calls) {
      if (!call.call_id) throw new Error('Appel de zoom sans identifiant.');
      if (!enableZoom || call.name !== 'inspect_region' || inspections >= 2) {
        next.push({ type: 'function_call_output', call_id: call.call_id,
          output: 'Outil non autorisé ou limite de deux inspections atteinte. Conclus sans zoom supplémentaire et signale toute incertitude.' });
        continue;
      }
      inspections++;
      attempts[criterion] = inspections;
      try {
        const args = JSON.parse(call.arguments ?? '') as unknown;
        const region = validateZoomRegion(args, originalImages.length);
        const evidence = await cropOriginalDiagram(originalImages[region.page - 1], region, signal);
        signal?.throwIfAborted();
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
          cropHeight: evidence.cropHeight, status: 'inspected' } });
      } catch (error) {
        if (signal?.aborted) throw new DOMException('Zoom interrompu.', 'AbortError');
        next.push({ type: 'function_call_output', call_id: call.call_id,
          output: 'Recadrage impossible : ' + (error instanceof Error ? error.message : 'zone incorrecte') +
            '. Choisis une autre zone si le budget le permet, sinon signale le doute.' });
        preview({ smartZoom: { criterion, status: 'rejected' } });
      }
    }
    input = next;
  }
  throw new Error('La correction a dépassé la limite de tours des outils de zoom.');
}
