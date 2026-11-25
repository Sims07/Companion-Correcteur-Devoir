type TextPart = { type?: string; text?: string };
type Message = { type: 'message'; content?: TextPart[] };
export type ResponsesOutputItem =
  | Message
  | { type: 'function_call'; name?: string; call_id?: string; arguments?: string }
  | { type: 'reasoning'; content?: TextPart[]; summary?: TextPart[] };

export interface ResponsesPayload {
  id?: string;
  output?: ResponsesOutputItem[];
  output_text?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
}

type ResponsesEvent = {
  type?: string;
  response?: ResponsesPayload;
  delta?: string;
  text?: string;
  item?: ResponsesOutputItem;
  output_index?: number;
  content_index?: number;
  message?: string;
  error?: { message?: string };
};

export function responsesMessage(payload: ResponsesPayload): string {
  return payload.output_text?.trim() ? payload.output_text : (payload.output ?? [])
    .filter(item => item?.type === 'message').flatMap(item => item.content ?? [])
    .filter(part => part?.type === 'output_text' || part?.type === 'text')
    .map(part => part.text ?? '').join('');
}

export function responsesReasoning(payload: ResponsesPayload): string {
  return (payload.output ?? []).filter(item => item?.type === 'reasoning')
    .flatMap(item => [...(item.content ?? []), ...(item.summary ?? [])])
    .filter(part => part?.type === 'reasoning_text' || part?.type === 'summary_text')
    .map(part => part.text ?? '').join('');
}

/** Reconcile only the answer channel. Tool calls always come from terminal output. */
export class ResponsesOutput {
  terminal?: ResponsesPayload;
  error?: string;
  private conflict = false;
  private indexed = true;
  private reasoningTail = '';
  private readonly parts = new Map<string, { output: number; content: number; delta: string; done?: string }>();

  consume(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const event = raw as ResponsesEvent;
    if ((event.type === 'response.reasoning_text.delta' || event.type === 'response.reasoning_summary_text.delta') &&
      typeof event.delta === 'string') {
      this.reasoningTail = (this.reasoningTail + event.delta).slice(-20_000);
    }
    if ((event.type === 'response.output_text.delta' || event.type === 'response.output_text.done' ||
      (event.type === 'response.output_item.done' && event.item?.type === 'message')) && event.output_index === undefined) {
      this.indexed = false;
    }
    const output = event.output_index ?? 0;
    const content = event.content_index ?? 0;
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      this.part(output, content).delta += event.delta;
    }
    if (event.type === 'response.output_text.done' && typeof event.text === 'string') {
      this.snapshot(output, content, event.text);
    }
    if (event.type === 'response.output_item.done' && event.item?.type === 'message') {
      this.messageSnapshot(output, event.item);
    }
    if (event.type === 'error' || event.type === 'response.failed') {
      this.error = event.error?.message ?? event.message ?? 'LM Studio Responses : génération échouée.';
    }
    if (event.type === 'response.completed' || event.type === 'response.incomplete' || event.type === 'response.failed') {
      if (!event.response || typeof event.response !== 'object') {
        this.error ??= 'Événement terminal Responses sans résultat.';
        return;
      }
      this.terminal = { ...event.response, status: event.response.status ?? event.type.slice('response.'.length) };
    }
  }

  get streamedReasoning(): string { return this.reasoningTail; }

  get streamedText(): string {
    return this.orderedParts.map(part => part.done || part.delta).join('');
  }

  reconcile(payload: ResponsesPayload): ResponsesPayload {
    const terminalText = responsesMessage(payload);
    if (payload.status !== 'completed') return payload;

    const streamed = this.streamedText;
    const parts = this.orderedParts;
    const indexed = this.indexed && !payload.output_text?.trim() && parts.length > 0 &&
      parts.every(part => payload.output?.[part.output]?.type === 'message');
    if (indexed) {
      payload.output?.forEach((item, index) => {
        if (item?.type === 'message') this.messageSnapshot(index, item);
      });
    }
    const complete = parts.every(part => part.done !== undefined);
    const compatible = !terminalText || !streamed || indexed ||
      (complete ? terminalText === streamed : terminalText.startsWith(streamed));
    if (this.conflict || !compatible) {
      throw new Error('Flux LM Studio Responses incohérent : le texte reçu diffère du résultat terminal.');
    }
    return { ...payload, output_text: indexed ? this.streamedText : terminalText || streamed };
  }

  private get orderedParts() {
    return [...this.parts.values()].sort((a, b) => a.output - b.output || a.content - b.content);
  }

  private part(output: number, content: number) {
    const key = output + ':' + content;
    let part = this.parts.get(key);
    if (!part) {
      part = { output, content, delta: '' };
      this.parts.set(key, part);
    }
    return part;
  }

  private snapshot(output: number, content: number, text: string): void {
    if (!text.trim()) return;
    const part = this.part(output, content);
    if ((part.done !== undefined && part.done !== text) || !text.startsWith(part.delta)) this.conflict = true;
    part.done = text;
  }

  private messageSnapshot(output: number, message: Message): void {
    message.content?.forEach((part, index) => {
      if ((part?.type === 'output_text' || part?.type === 'text') && typeof part.text === 'string') {
        this.snapshot(output, index, part.text);
      }
    });
  }
}
