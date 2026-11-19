/**
 * Extracts reasoning explicitly emitted by Ollama, never inferred from elapsed time.
 * Streamed JSON lines can be split at any byte boundary.
 */
export class OllamaThinkingStream {
  private buffer = '';
  private reasoning = '';
  private truncated = false;
  private static readonly MAX_REASONING = 20_000;
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

  private consume(line: string): void {
    if (!line) return;
    let packet: unknown;
    try { packet = JSON.parse(line); } catch { return; }
    if (!packet || typeof packet !== 'object') return;
    const event = packet as { message?: { thinking?: unknown }; thinking?: unknown };
    const thought = event.message?.thinking ?? event.thinking;
    if (typeof thought !== 'string' || !thought) return;
    const space = Math.max(0, OllamaThinkingStream.MAX_REASONING - this.reasoning.length);
    if (thought.length > space) this.truncated = true;
    this.reasoning += thought.slice(0, space);
  }
}

/** Also works for the (bounded) raw NDJSON already present in old local histories. */
export function extractOllamaThinking(rawResponse: string): string {
  const parser = new OllamaThinkingStream();
  parser.append(rawResponse);
  parser.finish();
  return parser.text;
}
