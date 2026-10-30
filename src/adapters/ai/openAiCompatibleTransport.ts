/** Browser-side transport adapter for OpenAI Chat Completions compatible endpoints.
 * It translates the existing Ollama-shaped requests/responses so grading orchestration stays unchanged.
 */
export interface OpenAiCompatibleSettings {
  endpoint: string;
  apiKey: string;
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
          image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` },
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
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) { controller.close(); return; }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const event = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
              error?: { message?: string };
            };
            if (event.error) {
              controller.enqueue(encoder.encode(JSON.stringify({ error: event.error.message ?? 'Erreur du fournisseur.' }) + '\\n'));
              continue;
            }
            const choice = event.choices?.[0];
            const chunk = choice?.delta?.content ?? '';
            const converted = {
              ...(chunk ? { message: { content: chunk } } : {}),
              ...(choice?.finish_reason ? { done_reason: choice.finish_reason, done: true } : {}),
              ...(event.usage ? { usage: event.usage } : {}),
            };
            if (Object.keys(converted).length) controller.enqueue(encoder.encode(JSON.stringify(converted) + '\\n'));
          } catch {
            // Ignore malformed SSE frames; the provider may emit comments or metadata.
          }
        }
        if (lines.length) return;
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(body, { status: response.status, headers: { 'Content-Type': 'application/x-ndjson' } });
}

/** Compatible fetch passed to the existing provider; credentials never enter request metadata or logs. */
export function createOpenAiCompatibleFetch(settings: OpenAiCompatibleSettings, fetchImpl: typeof fetch = fetch): typeof fetch {
  const url = completionUrl(settings.endpoint);
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!requestUrl.endsWith('/api/chat')) return fetchImpl(input, init);
    const source = typeof init?.body === 'string' ? JSON.parse(init.body) as {
      model: string; stream?: boolean; messages?: Array<{ role: string; content: string; images?: string[] }>;
      options?: { temperature?: number; num_predict?: number }; format?: unknown;
    } : {};
    const body = {
      model: source.model,
      stream: source.stream ?? false,
      messages: openAiMessages(source.messages ?? []),
      ...(source.options?.temperature !== undefined ? { temperature: source.options.temperature } : {}),
      ...(source.options?.num_predict !== undefined ? { max_tokens: source.options.num_predict } : {}),
      ...(source.format ? { response_format: { type: 'json_object' } } : {}),
      ...(source.stream ? { stream_options: { include_usage: true } } : {}),
    };
    const response = await fetchImpl(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(settings.apiKey.trim() ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!response.ok) return response;
    if (source.stream) return streamAsOllama(response);
    const payload = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      error?: { message?: string };
    };
    if (payload.error) return new Response(JSON.stringify({ error: payload.error.message }), { status: 200 });
    return new Response(JSON.stringify({ message: { content: payload.choices?.[0]?.message?.content ?? '' }, usage: payload.usage }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
}
