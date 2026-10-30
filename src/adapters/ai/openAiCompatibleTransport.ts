/** Browser-side transport adapter for OpenAI Chat Completions compatible endpoints.
 * It translates the existing Ollama-shaped requests/responses so grading orchestration stays unchanged.
 */
export interface OpenAiCompatibleSettings {
  endpoint: string;
  apiKey: string;
  repetitionPenaltyParameter?: 'none' | 'frequency_penalty' | 'repeat_penalty';
  frequencyPenalty?: number;
  /** Receives a credential-free, image-redacted preview for local observability. */
  onRequest?: (payload: string) => void;
}

function completionUrl(endpoint: string): string {
  const value = endpoint.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(value)) throw new Error('L’adresse de l’API doit commencer par http:// ou https://.');
  return value.endsWith('/chat/completions') ? value : `${value}/v1/chat/completions`;
}

function openAiMessages(messages: Array<{ role: string; content: string; images?: string[] }>) {
  return messages.map(({ role, content, images }) => ({
    role,
    content: images?.length
      ? [{ type: 'text', text: content }, ...images.map((image) => ({
          type: 'image_url',
          image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`, detail: 'high' },
        }))]
      : content,
  }));
}

function streamAsOllama(response: Response): Response {
  if (!response.body) return new Response(null, { status: response.status, statusText: response.statusText });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let dataLines: string[] = [];

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const dispatchEvent = () => {
        if (dataLines.length === 0) return false;
        const payload = dataLines.join('\n').trim();
        dataLines = [];
        if (!payload) return false;
        if (payload === '[DONE]') {
          controller.enqueue(encoder.encode(JSON.stringify({ done: true }) + '\n'));
          return true;
        }
        try {
          const event = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string | Array<{ type?: string; text?: string }> }; finish_reason?: string | null }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
            error?: { message?: string };
          };
          if (event.error) {
            controller.enqueue(encoder.encode(JSON.stringify({ error: event.error.message ?? 'Erreur du fournisseur.' }) + '\n'));
            return true;
          }
          const choice = event.choices?.[0];
          const deltaContent = choice?.delta?.content;
          const chunk = typeof deltaContent === 'string'
            ? deltaContent
            : Array.isArray(deltaContent)
              ? deltaContent.filter((part) => part.type === 'text' && typeof part.text === 'string').map((part) => part.text).join('')
              : '';
          const converted = {
            ...(chunk ? { message: { content: chunk } } : {}),
            ...(choice?.finish_reason ? { done_reason: choice.finish_reason, done: true } : {}),
            ...(event.usage ? { usage: event.usage } : {}),
          };
          if (Object.keys(converted).length) {
            controller.enqueue(encoder.encode(JSON.stringify(converted) + '\n'));
            return true;
          }
        } catch {
          // Ignore malformed SSE frames and provider-specific metadata events.
        }
        return false;
      };

      const consumeLine = (rawLine: string) => {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        if (line === '') {
          dispatchEvent();
          return;
        }
        if (line.startsWith(':')) return;
        if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          if (buffer) consumeLine(buffer);
          dispatchEvent();
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        let emitted = false;
        for (const line of lines) {
          const before = dataLines.length;
          consumeLine(line);
          if (before > 0 && line.endsWith('\r')) emitted = true;
          else if (line === '' || line === '\r') emitted = true;
        }
        if (emitted) return;
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(body, { status: response.status, headers: { 'Content-Type': 'application/x-ndjson' } });
}

function safeRequestPreview(body: Record<string, unknown>): string {
  const copy = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  const messages = copy.messages;
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (!message || typeof message !== 'object') continue;
      const content = (message as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== 'object' || (part as { type?: string }).type !== 'image_url') continue;
        const imageUrl = (part as { image_url?: { url?: string } }).image_url?.url ?? '';
        const mimeType = imageUrl.match(/^data:([^;,]+)/)?.[1] ?? 'image/unknown';
        const base64 = imageUrl.split(',', 2)[1] ?? '';
        (part as { image_url: { url: string } }).image_url = {
          url: `[IMAGE REDACTED · ${mimeType} · environ ${Math.floor(base64.length * 3 / 4)} octets]`,
        };
      }
    }
  }
  return JSON.stringify(copy, null, 2);
}

/** Compatible fetch passed to the existing provider; credentials never enter request metadata or logs. */
export function createOpenAiCompatibleFetch(settings: OpenAiCompatibleSettings, fetchImpl: typeof fetch = fetch): typeof fetch {
  const url = completionUrl(settings.endpoint);
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!requestUrl.endsWith('/api/chat')) return fetchImpl(input, init);
    const source: { model?: string; stream?: boolean; messages?: Array<{ role: string; content: string; images?: string[] }>; options?: { temperature?: number; num_predict?: number; stop?: string[]; repeat_penalty?: number; frequency_penalty?: number }; generation_token_parameter?: 'max_tokens' | 'max_completion_tokens'; format?: unknown } =
      typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const body = {
      model: source.model ?? '',
      stream: source.stream ?? false,
      messages: openAiMessages(source.messages ?? []),
      ...(source.options?.temperature !== undefined ? { temperature: source.options.temperature } : {}),
      ...(source.options?.num_predict !== undefined
        ? source.generation_token_parameter === 'max_completion_tokens'
          ? { max_completion_tokens: source.options.num_predict }
          : { max_tokens: source.options.num_predict }
        : {}),
      ...(source.options?.stop?.length ? { stop: source.options.stop } : {}),
      ...(source.options?.frequency_penalty !== undefined
        ? { frequency_penalty: source.options.frequency_penalty }
        : source.options?.repeat_penalty !== undefined
          ? settings.repetitionPenaltyParameter === 'repeat_penalty'
            ? { repeat_penalty: source.options.repeat_penalty }
            : settings.repetitionPenaltyParameter === 'frequency_penalty'
              ? { frequency_penalty: settings.frequencyPenalty ?? 0 }
              : {}
          : {}),
      ...(source.format === 'json'
        ? { response_format: { type: 'json_object' } }
        : typeof source.format === 'object' && source.format !== null
          ? { response_format: { type: 'json_schema', json_schema: { name: 'structured_response', strict: true, schema: source.format } } }
          : {}),
      ...(source.stream ? { stream_options: { include_usage: true } } : {}),
    };
    const headers = { 'Content-Type': 'application/json', ...(settings.apiKey.trim() ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {}) };
    const send = (requestBody: Record<string, unknown>) => {
      settings.onRequest?.(safeRequestPreview(requestBody));
      return fetchImpl(url, { ...init, headers, body: JSON.stringify(requestBody) });
    };
    let requestBody: Record<string, unknown> = body;
    let response = await send(requestBody);
    // Newer OpenAI models use max_completion_tokens. Some older compatible
    // endpoints still expose only max_tokens, so retry that parameter on 4xx.
    if (!response.ok && [400, 422].includes(response.status) && 'max_completion_tokens' in requestBody) {
      const { max_completion_tokens, ...legacyBody } = requestBody;
      requestBody = { ...legacyBody, max_tokens: max_completion_tokens };
      response = await send(requestBody);
    }
    if (!response.ok && [400, 422].includes(response.status) && 'stream_options' in requestBody) {
      const { stream_options: _streamOptions, ...withoutStreamOptions } = requestBody;
      requestBody = withoutStreamOptions;
      response = await send(requestBody);
    }
    if (!response.ok && [400, 422].includes(response.status)) {
      const messages = requestBody.messages;
      const hasHighDetailImage = Array.isArray(messages) && messages.some((message) =>
        message && typeof message === 'object'
        && Array.isArray((message as { content?: unknown }).content)
        && ((message as { content: Array<{ type?: string; image_url?: { detail?: string } }> }).content)
          .some((part) => part.type === 'image_url' && part.image_url?.detail === 'high'),
      );
      if (hasHighDetailImage) {
        const fallbackBody = JSON.parse(JSON.stringify(requestBody)) as Record<string, unknown>;
        for (const message of fallbackBody.messages as Array<{ content?: Array<{ type?: string; image_url?: { detail?: string } }> }>) {
          for (const part of message.content ?? []) {
            if (part.type === 'image_url' && part.image_url) delete part.image_url.detail;
          }
        }
        requestBody = fallbackBody;
        response = await send(requestBody);
      }
    }
    if (!response.ok && [400, 422].includes(response.status) && 'response_format' in requestBody && (requestBody.response_format as { type?: string })?.type === 'json_schema') {
      requestBody = { ...requestBody, response_format: { type: 'json_object' } };
      response = await send(requestBody);
    }
    if (!response.ok) return response;
    if (source.stream) return streamAsOllama(response);
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string | null }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      error?: { message?: string };
    };
    if (payload.error) return new Response(JSON.stringify({ error: payload.error.message }), { status: 200 });
    return new Response(JSON.stringify({ message: { content: payload.choices?.[0]?.message?.content ?? '' }, done_reason: payload.choices?.[0]?.finish_reason ?? undefined, usage: payload.usage }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
}
