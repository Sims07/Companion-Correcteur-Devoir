/**
 * Extracts both thinking and message content explicitly emitted by Ollama.
 * Streamed JSON lines can be split at any byte boundary.
 */
export class OllamaThinkingStream {
  private buffer = '';
  private reasoning = '';
  private messageContent = '';
  private truncated = false;
  private messageTruncated = false;
  private static readonly MAX_REASONING = 20_000;
  private static readonly MAX_MESSAGE = 20_000;
  private static readonly MAX_PENDING_LINE = 256_000;

  append(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      this.consume(this.buffer.slice(0, newline).trim());
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf('\n');
    }
    if (this.buffer.length > OllamaThinkingStream.MAX_PENDING_LINE) this.buffer = '';
  }

  finish(): void {
    if (this.buffer.trim()) this.consume(this.buffer.trim());
    this.buffer = '';
  }

  get text(): string {
    if (!this.truncated) return this.reasoning;
    const suffix = '\n… raisonnement tronqué dans l’inspecteur';
    return this.reasoning.slice(0, OllamaThinkingStream.MAX_REASONING - suffix.length) + suffix;
  }

  /** Final answer fragments only, without reasoning or NDJSON framing. */
  get message(): string {
    if (!this.messageTruncated) return this.messageContent;
    const suffix = '\n… message tronqué dans l’inspecteur';
    return this.messageContent.slice(0, OllamaThinkingStream.MAX_MESSAGE - suffix.length) + suffix;
  }

  private consume(line: string): void {
    if (!line) return;
    let packet: unknown;
    try { packet = JSON.parse(line); } catch { return; }
    if (!packet || typeof packet !== 'object') return;
    const event = packet as { message?: { thinking?: unknown; content?: unknown }; thinking?: unknown; response?: unknown };
    const thought = event.message?.thinking ?? event.thinking;
    if (typeof thought === 'string' && thought) {
      const space = Math.max(0, OllamaThinkingStream.MAX_REASONING - this.reasoning.length);
      if (thought.length > space) this.truncated = true;
      this.reasoning += thought.slice(0, space);
    }
    // /api/chat exposes message.content; /api/generate exposes response.
    const answer = event.message?.content ?? event.response;
    if (typeof answer === 'string' && answer) {
      const space = Math.max(0, OllamaThinkingStream.MAX_MESSAGE - this.messageContent.length);
      if (answer.length > space) this.messageTruncated = true;
      this.messageContent += answer.slice(0, space);
    }
  }
}

/** Also works for the (bounded) raw NDJSON already present in old local histories. */
export function extractOllamaThinking(rawResponse: string): string {
  const parser = new OllamaThinkingStream();
  parser.append(rawResponse);
  parser.finish();
  return parser.text;
}

/** Decode previously recorded Ollama output; does not include Thinking text. */
export function extractOllamaMessage(rawResponse: string): string {
  const parser = new OllamaThinkingStream();
  parser.append(rawResponse);
  parser.finish();
  return parser.message;
}
