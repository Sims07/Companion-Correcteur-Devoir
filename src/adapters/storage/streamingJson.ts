/** Decode large JSON files without constructing one V8-limited monolithic string. */
type Frame = {
  kind: 'object' | 'array';
  value: Record<string, unknown> | unknown[];
  expected: 'firstKey' | 'key' | 'colon' | 'firstValue' | 'value' | 'commaOrEnd';
  key?: string;
};

export class StreamingJsonParser {
  private stack: Frame[] = [];
  private token: 'string' | 'primitive' | null = null;
  private role: 'key' | 'value' = 'value';
  private parts: string[] = [];
  private escaped = false;
  private root: unknown;
  private hasRoot = false;

  private invalid(): never { throw new SyntaxError('Contenu JSON invalide.'); }

  private addValue(value: unknown): void {
    const frame = this.stack[this.stack.length - 1];
    if (!frame) {
      if (this.hasRoot) this.invalid();
      this.root = value;
      this.hasRoot = true;
      return;
    }
    if (frame.expected !== 'firstValue' && frame.expected !== 'value') this.invalid();
    if (frame.kind === 'object') {
      // Avoid __proto__'s setter when reading an untrusted JSON object.
      Object.defineProperty(frame.value, frame.key!, {
        value, writable: true, enumerable: true, configurable: true,
      });
      frame.key = undefined;
    } else (frame.value as unknown[]).push(value);
    frame.expected = 'commaOrEnd';
  }

  private open(kind: 'object' | 'array'): void {
    const value = kind === 'object' ? {} : [];
    this.addValue(value);
    this.stack.push({ kind, value, expected: kind === 'object' ? 'firstKey' : 'firstValue' });
  }

  private close(kind: 'object' | 'array'): void {
    const frame = this.stack[this.stack.length - 1];
    if (!frame || frame.kind !== kind) this.invalid();
    if (frame.expected !== 'commaOrEnd' &&
        frame.expected !== (kind === 'object' ? 'firstKey' : 'firstValue')) this.invalid();
    this.stack.pop();
  }

  private start(kind: 'string' | 'primitive', role: 'key' | 'value', first: string): void {
    this.token = kind;
    this.role = role;
    this.parts = [first];
    this.escaped = false;
  }

  private finishToken(): void {
    const raw = this.parts.join('');
    const role = this.role;
    this.token = null;
    this.parts = [];
    let parsed: unknown;
    try { parsed = JSON.parse(raw); }
    catch (cause) {
      if (cause instanceof SyntaxError) this.invalid();
      throw cause;
    }
    if (role === 'key') {
      if (typeof parsed !== 'string') this.invalid();
      const frame = this.stack[this.stack.length - 1];
      if (!frame || frame.kind !== 'object' ||
          (frame.expected !== 'firstKey' && frame.expected !== 'key')) this.invalid();
      frame.key = parsed;
      frame.expected = 'colon';
    } else this.addValue(parsed);
  }

  write(chunk: string): void {
    let i = 0;
    while (i < chunk.length) {
      if (this.token === 'string') {
        const from = i;
        for (; i < chunk.length; i += 1) {
          const c = chunk[i];
          if (this.escaped) { this.escaped = false; continue; }
          if (c === '\\') { this.escaped = true; continue; }
          if (c === '"') {
            this.parts.push(chunk.slice(from, i + 1));
            i += 1;
            this.finishToken();
            break;
          }
        }
        if (this.token === 'string') this.parts.push(chunk.slice(from, i));
        continue;
      }
      if (this.token === 'primitive') {
        const from = i;
        while (i < chunk.length && !/[\s,\]}]/.test(chunk[i])) i += 1;
        this.parts.push(chunk.slice(from, i));
        if (i < chunk.length) this.finishToken();
        continue;
      }
      const c = chunk[i];
      if (/\s/.test(c)) { i += 1; continue; }
      const frame = this.stack[this.stack.length - 1];
      if (!frame && this.hasRoot) this.invalid();
      if (frame?.expected === 'colon') {
        if (c !== ':') this.invalid();
        frame.expected = 'value';
        i += 1;
        continue;
      }
      if (frame?.expected === 'commaOrEnd') {
        if (c === (frame.kind === 'object' ? '}' : ']')) this.close(frame.kind);
        else if (c === ',') frame.expected = frame.kind === 'object' ? 'key' : 'value';
        else this.invalid();
        i += 1;
        continue;
      }
      if (frame?.kind === 'object' && (frame.expected === 'firstKey' || frame.expected === 'key')) {
        if (c === '}' && frame.expected === 'firstKey') {
          this.close('object');
          i += 1;
          continue;
        }
        if (c !== '"') this.invalid();
        this.start('string', 'key', '"');
        i += 1;
        continue;
      }
      if (frame?.kind === 'array' && frame.expected === 'firstValue' && c === ']') {
        this.close('array');
        i += 1;
        continue;
      }
      if (c === '{') this.open('object');
      else if (c === '[') this.open('array');
      else if (c === '"') this.start('string', 'value', '"');
      else if (/[-0-9tfn]/.test(c)) this.start('primitive', 'value', c);
      else this.invalid();
      i += 1;
    }
  }

  finish(): unknown {
    if (this.token === 'primitive') this.finishToken();
    if (this.token || this.stack.length || !this.hasRoot) this.invalid();
    return this.root;
  }
}

/** Read one File/Blob in bounded UTF-8 chunks (including split multibyte characters). */
export async function parseJsonBlobInChunks(
  file: Pick<Blob, 'size' | 'slice'>,
  onProgress?: (readBytes: number, totalBytes: number) => void,
): Promise<unknown> {
  const parser = new StreamingJsonParser();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const chunkSize = 2 * 1024 * 1024;
  for (let start = 0; start < file.size; start += chunkSize) {
    const end = Math.min(file.size, start + chunkSize);
    parser.write(decoder.decode(new Uint8Array(await file.slice(start, end).arrayBuffer()), { stream: true }));
    onProgress?.(end, file.size);
    if (end < file.size) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  parser.write(decoder.decode());
  return parser.finish();
}
