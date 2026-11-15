/** Native System One models classify choices; they cannot generate evidence or scores. */
export function isNativeDecisionModel(model: string): boolean {
  return /^(?:d[123]|tev1|nimble|clef(?:-flash)?|strands(?:-decider)?|pplx-decider(?:-flash)?)(?::|$)/i.test(model.trim());
}

/** Ollama's official System One image support is Clef/Clef-Flash. Keep the
 * existing D1/D3 opt-in path for locally adapted decision models. Tev1 is
 * explicitly text-only through native System One, even if based on Qwen3.5. */
export function isVisualDecisionModel(model: string): boolean {
  return /^(?:d1|d3|clef(?:-flash)?)(?::|$)/i.test(model.trim());
}
