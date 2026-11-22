import { isOllamaInferenceRequest, type OllamaNativeTimings } from './ollamaTimings.ts';
import { isLmStudioChat, isOpenAiCompletionRequest, type OpenAiTokenUsage } from './openAiCompletionStream.ts';

/** Ollama's native generation speed versus OpenAI-compatible end-to-end throughput. */
export function modelTokenRate(record: {
  state: string;
  url: string;
  durationMs: number | null;
  providerTimings?: OllamaNativeTimings | null;
  tokenUsage?: OpenAiTokenUsage | null;
}): { tokensPerSecond: number; completionTokens: number; promptTokens?: number; source: 'native' | 'end-to-end' } | null {
  if (record.state !== 'success') return null;
  if (isOllamaInferenceRequest(record.url)) {
    const count = record.providerTimings?.evalCount;
    const timeMs = record.providerTimings?.generationMs;
    if (count === undefined || !Number.isSafeInteger(count) || count <= 0 || !timeMs || timeMs <= 0) return null;
    return { tokensPerSecond: count * 1000 / timeMs, completionTokens: count,
      ...(record.providerTimings?.promptEvalCount !== undefined ? { promptTokens: record.providerTimings.promptEvalCount } : {}),
      source: 'native' };
  }
  if (isOpenAiCompletionRequest(record.url) || isLmStudioChat(record.url)) {
    const count = record.tokenUsage?.completionTokens;
    const durationMs = record.durationMs;
    if (count === undefined || !Number.isSafeInteger(count) || count <= 0 || durationMs === null || durationMs <= 0) return null;
    // Includes prompt processing, network and generation; not native token decoding speed.
    return { tokensPerSecond: count * 1000 / durationMs, completionTokens: count,
      ...(record.tokenUsage?.promptTokens !== undefined ? { promptTokens: record.tokenUsage.promptTokens } : {}),
      source: 'end-to-end' };
  }
  return null;
}
