/** Native timings reported by Ollama, in milliseconds (Ollama's wire values are nanoseconds). */
export interface OllamaNativeTimings {
  totalMs: number;
  loadMs?: number;
  promptEvaluationMs?: number;
  generationMs?: number;
  doneReason?: string;
}

function milliseconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value / 1_000_000 * 100) / 100
    : undefined;
}

/** Distinguish Ollama inference from ordinary HTTP requests; do not treat request latency as model time. */
export function isOllamaInferenceRequest(url: string): boolean {
  try {
    return /\\/api\\/(?:chat|generate)$/.test(new URL(url, 'http://localhost').pathname);
  } catch {
    return false;
  }
}

/**
 * Supports native NDJSON streams as well as a single JSON response.
 * Only an explicitly completed event with a valid total_duration is authoritative.
 * Partial streams and OpenAI-compatible responses have no fabricated timing.
 */
export function readOllamaNativeTimings(responseBody: string): OllamaNativeTimings | null {
  const parse = (line: string): OllamaNativeTimings | null => {
    try {
      const event: unknown = JSON.parse(line);
      if (!event || typeof event !== 'object') return null;
      const data = event as Record<string, unknown>;
      if (data.done !== true) return null;
      const totalMs = milliseconds(data.total_duration);
      if (totalMs === undefined) return null;
      const loadMs = milliseconds(data.load_duration);
      const promptEvaluationMs = milliseconds(data.prompt_eval_duration);
      const generationMs = milliseconds(data.eval_duration);
      return {
        totalMs,
        ...(loadMs !== undefined ? { loadMs } : {}),
        ...(promptEvaluationMs !== undefined ? { promptEvaluationMs } : {}),
        ...(generationMs !== undefined ? { generationMs } : {}),
        ...(typeof data.done_reason === 'string' ? { doneReason: data.done_reason } : {}),
      };
    } catch {
      return null;
    }
  };
  const whole = parse(responseBody.trim());
  if (whole) return whole;
  const lines = responseBody.trim().split(/\\r?\\n/);
  for (let index = lines.length - 1; index >= 0; index--) {
    const timing = parse(lines[index]!);
    if (timing) return timing;
  }
  return null;
}
