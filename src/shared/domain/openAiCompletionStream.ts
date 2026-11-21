import { OllamaThinkingStream } from './ollamaThinkingStream.ts';

/**
 * Decode native OpenAI Chat Completions responses for LOCAL diagnostics.
 * Reasoning is never promoted to final answer content. SSE may be split at
 * arbitrary byte boundaries, including CRLF and multi-line data frames.
 */
export class OpenAiCompletionStream {
  private readonly collector = new OllamaThinkingStream();
  private lineBuffer = '';
  private dataLines: string[] = [];
  private jsonBuffer = '';
  private finalReason: string | undefined;
  private static readonly MAX_PENDING = 256_000;

  constructor(private readonly streaming: boolean) {}

  append(chunk: string): void {
    if (!this.streaming) {
      this.jsonBuffer = (this.jsonBuffer + chunk).slice(0, OpenAiCompletionStream.MAX_PENDING);
      return;
    }
    this.lineBuffer += chunk;
    let newline = this.lineBuffer.indexOf('\n');
    while (newline !== -1) {
      this.consumeLine(this.lineBuffer.slice(0, newline));
      this.lineBuffer = this.lineBuffer.slice(newline + 1);
      newline = this.lineBuffer.indexOf('\n');
    }
    if (this.lineBuffer.length > OpenAiCompletionStream.MAX_PENDING) this.lineBuffer = '';
  }

  finish(): void {
    if (this.streaming) {
      if (this.lineBuffer) this.consumeLine(this.lineBuffer);
      this.flushEvent();
      this.lineBuffer = '';
    } else {
      this.consumePayload(this.jsonBuffer);
      this.jsonBuffer = '';
    }
    this.collector.finish();
  }

  get message(): string { return this.collector.message; }
  get thinking(): string { return this.collector.text; }
  get messageCharacters(): number { return this.collector.messageCharacters; }
  get thinkingCharacters(): number { return this.collector.thinkingCharacters; }
  get finishReason(): string | undefined { return this.finalReason; }

  private consumeLine(raw: string): void {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line === '') {
      this.flushEvent();
    } else if (line.startsWith('data:')) {
      this.dataLines.push(line.slice(5).replace(/^ /, ''));
      // Never keep an unbounded unfinished SSE event in memory.
      if (this.dataLines.join('').length > OpenAiCompletionStream.MAX_PENDING) this.dataLines = [];
    }
  }

  private flushEvent(): void {
    if (this.dataLines.length === 0) return;
    const payload = this.dataLines.join('\n');
    this.dataLines = [];
    if (payload.trim() !== '[DONE]') this.consumePayload(payload);
  }

  private consumePayload(raw: string): void {
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { return; }
    if (!payload || typeof payload !== 'object') return;
    const event = payload as {
      choices?: Array<{
        delta?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown };
        message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown };
        finish_reason?: unknown;
      }>;
    };
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
}

export function isOpenAiCompletionRequest(url: string): boolean {
  return /\/chat\/completions(?:[?#]|$)/i.test(url);
}

export function extractOpenAiCompletion(raw: string): { message: string; thinking: string; finishReason?: string } {
  const parser = new OpenAiCompletionStream(/^\s*(?:data:|:)/.test(raw));
  parser.append(raw);
  parser.finish();
  return { message: parser.message, thinking: parser.thinking, ...(parser.finishReason ? { finishReason: parser.finishReason } : {}) };
}
