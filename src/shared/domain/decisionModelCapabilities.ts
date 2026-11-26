/** Native System One models classify choices; they cannot generate evidence or scores. */
export function isNativeDecisionModel(model: string): boolean {
  return /^(?:d[123]|tev1|nimble|clef(?:-flash)?|strands(?:-decider)?|pplx-decider(?:-flash)?)(?=[:@.]|-(?:[0-9]+(?:\.[0-9]+)?b|q[0-9]+|gguf)(?:[-:@.]|$)|$)/i.test(model.trim().split('/').pop() ?? '');
}

/** Ollama's official System One image support is Clef/Clef-Flash. Keep the
 * existing D1/D3 opt-in path for locally adapted decision models. Tev1 is
 * explicitly text-only through native System One, even if based on Qwen3.5. */
export function isVisualDecisionModel(model: string): boolean {
  return /^(?:d1|d3|clef(?:-flash)?)(?=[:@.]|-(?:[0-9]+(?:\.[0-9]+)?b|q[0-9]+|gguf)(?:[-:@.]|$)|$)/i.test(model.trim().split('/').pop() ?? '');
}

/** A Bionic instance can have a user-defined alias. An explicit image profile
 * may schedule it; the provider verifies its native catalogue before inference. */
export function canTryVisualDecision(config: {
  apiCompatible?: boolean; analysisModel?: string; correctionMethod?: string;
}): boolean {
  return isVisualDecisionModel(config.analysisModel ?? '') ||
    (config.apiCompatible === true && config.correctionMethod === 'visual-decision');
}
