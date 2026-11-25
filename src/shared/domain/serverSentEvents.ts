/** Incremental SSE framing shared by the transport and diagnostics. */
export class ServerSentEvents {
  private pending = '';
  private data: string[] = [];
  private size = 0;
  private overflow = false;

  constructor(
    private readonly onData: (data: string) => void,
    private readonly onOverflow: () => void = () => {},
  ) {}

  append(chunk: string): void {
    this.pending += chunk;
    let start = 0;
    for (let end = this.pending.indexOf('\n'); end !== -1; end = this.pending.indexOf('\n', start)) {
      this.line(this.pending.slice(start, end));
      start = end + 1;
    }
    this.pending = this.pending.slice(start);
    if (this.pending.length > 4_000_000) {
      this.pending = '';
      this.discard();
    }
  }

  finish(): void {
    if (this.pending) this.line(this.pending);
    this.flush();
    this.pending = '';
  }

  private line(raw: string): void {
    const line = raw.replace(/\r$/, '');
    if (!line) this.flush();
    else if (!this.overflow && line.startsWith('data:')) {
      this.size += line.length;
      if (this.size > 4_000_000) this.discard();
      else this.data.push(line.slice(5).replace(/^ /, ''));
    }
  }

  private discard(): void {
    this.overflow = true;
    this.data = [];
    this.onOverflow();
  }

  private flush(): void {
    const data = this.data.join('\n');
    this.data = [];
    this.size = 0;
    this.overflow = false;
    if (data.trim() && data.trim() !== '[DONE]') this.onData(data);
  }
}
