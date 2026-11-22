import { copyNetworkRequestMetadata } from '../../ports/networkRequestMetadata.ts';

export function compatibleEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/api\/v1\/chat\/?$/, '/v1/chat/completions');
}

interface DiagramTurn {
  model: string;
  messages: { content: string; images?: string[] }[];
  think: boolean | string;
  omitReasoningParameter?: boolean;
  options: { num_predict: number; temperature?: number; top_p?: number; top_k?: number };
  format?: unknown;
}

export async function sendLmStudioDiagramTurn(endpoint: string, apiKey: string, conversation: { responseId?: string },
  turn: DiagramTurn, init: RequestInit, fetchImpl: typeof fetch, preview: (payload: unknown) => void): Promise<Response> {
  const message = turn.messages[0];
  // Native chat accepts a prompt, but has no response_format field.
  const prompt = message.content + (turn.format ? '\nSchéma JSON de la réponse attendue :\n' + JSON.stringify(turn.format) : '');
  const photos = conversation.responseId ? [] : message.images ?? [];
  const textInput = { type: 'text', content: prompt };
  const reasoning = turn.think === true ? 'on' : !turn.think || turn.think === 'none' ? 'off' : turn.think;
  const body = {
    model: turn.model, store: true, stream: true, ...(turn.omitReasoningParameter ? {} : { reasoning }),
    ...(turn.options.temperature !== undefined ? { temperature: turn.options.temperature } : {}),
    ...(turn.options.top_p !== undefined ? { top_p: turn.options.top_p } : {}),
    ...(turn.options.top_k !== undefined ? { top_k: turn.options.top_k } : {}),
    max_output_tokens: turn.options.num_predict,
    ...(conversation.responseId ? { previous_response_id: conversation.responseId } : {}),
    input: [...photos.map(data_url => ({ type: 'image', data_url })), textInput],
  };
  preview({ ...body, input: [...photos.map(() => ({ type: 'image', data_url: '[IMAGE REDACTED]' })), textInput] });
  const response = await fetchImpl(endpoint, copyNetworkRequestMetadata(init, {
    ...init, headers: { 'Content-Type': 'application/json', ...(apiKey.trim() ? { Authorization: 'Bearer ' + apiKey.trim() } : {}) },
    body: JSON.stringify(body),
  }));
  if (!response.ok) return response;
  if (!response.body) throw new Error('Flux LM Studio absent.');
  let buffer = '';
  let completed = false;
  const encoder = new TextEncoder();
  function consume(frame: string, controller: TransformStreamDefaultController<Uint8Array>) {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data.trim()) return;
    const event = JSON.parse(data);
    let chunk;
    if (event.type === 'error') throw new Error(event.error?.message || 'Génération LM Studio interrompue.');
    if (event.type === 'message.delta') chunk = { message: { content: event.content } };
    if (event.type === 'reasoning.delta') chunk = { message: { thinking: event.content } };
    if (event.type === 'chat.end') {
      const id = event.result?.response_id;
      if (typeof id !== 'string' || !id.startsWith('resp_')) throw new Error('LM Studio n’a pas fourni l’identifiant de conversation de cette copie.');
      conversation.responseId = id;
      completed = true;
      const stats = event.result.stats;
      chunk = { done: true, prompt_eval_count: stats?.input_tokens, eval_count: stats?.total_output_tokens,
        tokens_per_second: stats?.tokens_per_second };
    }
    if (chunk) controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));
  }
  const stream = response.body.pipeThrough(new TextDecoderStream()).pipeThrough(new TransformStream<string, Uint8Array>({
    transform(text, controller) {
      const frames = (buffer + text).split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) consume(frame, controller);
    },
    flush(controller) {
      consume(buffer, controller);
      if (!completed) throw new Error('Conversation LM Studio interrompue avant la fin du critère.');
    },
  }));
  return new Response(stream);
}
