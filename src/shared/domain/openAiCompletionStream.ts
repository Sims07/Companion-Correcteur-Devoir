import { OllamaThinkingStream } from './ollamaThinkingStream.ts';
import { ResponsesOutput, responsesMessage, responsesReasoning, type ResponsesPayload } from './responsesOutput.ts';
import { ServerSentEvents } from './serverSentEvents.ts';

export type OpenAiTokenUsage = { promptTokens?: number; completionTokens: number };

/**
 * Decode native OpenAI Chat Completions responses for LOCAL diagnostics.
 * Reasoning is never promoted to final answer content. SSE may be split at
 * arbitrary byte boundaries, including CRLF and multi-line data frames.
 */
export class OpenAiCompletionStream {
  private readonly collector = new OllamaThinkingStream();
  private readonly events = new ServerSentEvents(data => this.consumePayload(data));
  private readonly responses = new ResponsesOutput();
  private reconciledMessage?: string;
  private hasStreamedMessage = false;
  private jsonBuffer = '';
  private finalReason: string | undefined;
  private finalUsage: OpenAiTokenUsage | undefined;
  private static readonly MAX_PENDING = 256_000;

  constructor(private readonly streaming: boolean) {}

  append(chunk: string): void {
    if (!this.streaming) {
      this.jsonBuffer = (this.jsonBuffer + chunk).slice(0, OpenAiCompletionStream.MAX_PENDING);
      return;
    }
    this.events.append(chunk);
  }

  finish(): void {
    if (this.streaming) {
      this.events.finish();
    } else {
      this.consumePayload(this.jsonBuffer);
      this.jsonBuffer = '';
    }
    this.collector.finish();
  }

  private get responsesMessage(): string | undefined {
    return this.reconciledMessage ?? (this.hasStreamedMessage ? this.responses.streamedText : undefined);
  }
  get message(): string {
    const answer = this.responsesMessage;
    if (answer === undefined) return this.collector.message;
    const suffix = '\n… message tronqué dans l’inspecteur';
    return answer.length > 20_000 ? answer.slice(0, 20_000 - suffix.length) + suffix : answer;
  }
  get thinking(): string { return this.collector.text; }
  get messageCharacters(): number { return this.responsesMessage?.length ?? this.collector.messageCharacters; }
  get thinkingCharacters(): number { return this.collector.thinkingCharacters; }
  get finishReason(): string | undefined { return this.finalReason; }
  get usage(): OpenAiTokenUsage | undefined { return this.finalUsage; }

  private consumePayload(raw: string): void {
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return; }
    if (!payload || typeof payload !== 'object') return;
    const event = payload as {
      type?: string;
      delta?: string;
      content?: string;
      result?: { stats?: { input_tokens?: number; total_output_tokens?: number } };
      choices?: Array<{
        delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown };
        message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown };
        finish_reason?: unknown;
      }>;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    };
    this.responses.consume(event);
    if (event.type === 'response.output_text.delta' || event.type === 'response.output_text.done' ||
        event.type === 'response.output_item.done') {
      // Use the accumulated text only when publishing a preview or reconciling the terminal event.
      this.hasStreamedMessage = true;
      return;
    }
    if (event.type === 'response.reasoning_text.delta' ||
        event.type === 'response.reasoning_summary_text.delta') {
      if (typeof event.delta === 'string') this.collector.append(JSON.stringify({ message: { thinking: event.delta } }) + '\n');
      return;
    }
    if (event.type === 'response.completed' || event.type === 'response.incomplete' || event.type === 'response.failed') {
      if (this.responses.terminal) this.consumeResponses(this.responses.terminal);
      return;
    }
    if (Array.isArray((payload as ResponsesPayload).output)) {
      this.consumeResponses(payload as ResponsesPayload);
      return;
    }
    // LM Studio may send the final usage in an SSE frame without choices.
    if (event.type === 'message.delta' || event.type === 'reasoning.delta') {
      const key = event.type === 'message.delta' ? 'content' : 'thinking';
      this.collector.append(JSON.stringify({ message: { [key]: event.content } }) + '\n');
      return;
    }
    const stats = event.result?.stats;
    const usage = event.usage ?? (stats && { prompt_tokens: stats.input_tokens, completion_tokens: stats.total_output_tokens });
    if (usage && typeof usage.completion_tokens === 'number' && Number.isSafeInteger(usage.completion_tokens) && usage.completion_tokens >= 0) {
      const promptTokens = typeof usage.prompt_tokens === 'number' && Number.isSafeInteger(usage.prompt_tokens) && usage.prompt_tokens >= 0 ? usage.prompt_tokens : undefined;
      this.finalUsage = { completionTokens: usage.completion_tokens, ...(promptTokens !== undefined ? { promptTokens } : {}) };
    }
    const choice = event.choices?.[0];
    if (!choice) return;
    const segment = choice.delta ?? choice.message;
    if (typeof choice.finish_reason === 'string' && choice.finish_reason) this.finalReason = choice.finish_reason;
    const content = segment?.content;
    const message = typeof content === 'string' ? content
      : Array.isArray(content) ? content.filter((part) => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string').map((part) => part.text as string).join('')
        : '';
    const rawThinking = segment?.reasoning_content ?? segment?.reasoning;
    const thinking = typeof rawThinking === 'string' ? rawThinking : '';
    if (message || thinking) this.collector.append(JSON.stringify({ message: { content: message, thinking } }) + '\n');
  }
  private consumeResponses(payload: ResponsesPayload): void {
    const status = payload.status;
    try {
      this.reconciledMessage = responsesMessage(this.responses.reconcile(payload)) || this.responses.streamedText;
    } catch {
      this.reconciledMessage = this.responses.streamedText;
    }
    if (status === 'completed') this.finalReason = 'stop';
    if (status === 'failed') this.finalReason = 'failed';
    if (status === 'incomplete') this.finalReason = payload.incomplete_details?.reason === 'max_output_tokens'
      ? 'length' : payload.incomplete_details?.reason ?? 'incomplete';
    const usage = payload.usage;
    if (usage && typeof usage.output_tokens === 'number' && Number.isSafeInteger(usage.output_tokens) && usage.output_tokens >= 0) {
      const promptTokens = usage.input_tokens;
      this.finalUsage = { completionTokens: usage.output_tokens,
        ...(typeof promptTokens === 'number' && Number.isSafeInteger(promptTokens) && promptTokens >= 0 ? { promptTokens } : {}) };
    }
    // Terminal events repeat deltas. Use their full output only if no
    // fragments of that channel were received (some servers omit deltas).
    if (!this.collector.thinkingCharacters) {
      this.collector.append(JSON.stringify({ message: { thinking: responsesReasoning(payload) } }) + '\n');
    }
  }
}

export function isOpenAiResponsesRequest(url: string): boolean {
  return /\/v1\/responses\/?(?:[?#]|$)/i.test(url);
}

export function isOpenAiCompletionRequest(url: string): boolean {
  return /\/chat\/completions(?:[?#]|$)/i.test(url);
}

export function isLmStudioChat(endpoint: string): boolean {
  return /\/api\/v1\/chat\/?$/.test(endpoint.trim());
}

export function extractOpenAiCompletion(raw: string): { message: string; thinking: string; finishReason?: string } {
  const parser = new OpenAiCompletionStream(/^\s*(?:event:|data:|:)/.test(raw));
  parser.append(raw);
  parser.finish();
  return { message: parser.message, thinking: parser.thinking, ...(parser.finishReason ? { finishReason: parser.finishReason } : {}) };
}
