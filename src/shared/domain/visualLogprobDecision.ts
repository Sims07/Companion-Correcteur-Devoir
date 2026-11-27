/** Experimental closed-choice inference from a single Responses output token.
 * Probabilities refer to tokens, not calibrated correctness of a school grade. */
export const visualLogprobTopAlternatives = 10;
export const logprobChoices = ['present', 'absent', 'partial', 'undetermined'] as const;
export type LogprobChoice = typeof logprobChoices[number];
export type LogprobDistribution = Record<LogprobChoice, number | null>;
export interface LogprobDecision {
  sampled: LogprobChoice | null;
  verdict: LogprobChoice | null;
  probabilities: LogprobDistribution;
  unobservedMass: number | null;
  status: 'resolved' | 'ambiguous' | 'unavailable';
  reason: string;
  /** Conditional scores over observed tokens only; never a usable probability or grading verdict. */
  relativeObservation?: { observedMass: number; scores: LogprobDistribution; leader: LogprobChoice | null };
}
const emptyDistribution = (): LogprobDistribution =>
  ({ present: null, absent: null, partial: null, undetermined: null });
export function unavailableLogprobDecision(reason: string): LogprobDecision {
  return { sampled: null, verdict: null, probabilities: emptyDistribution(), unobservedMass: null, status: 'unavailable', reason };
}
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function choice(token: unknown): LogprobChoice | null {
  if (typeof token !== 'string') return null;
  const index = ['A', 'B', 'C', 'D'].indexOf(token.trim());
  return index < 0 ? null : logprobChoices[index];
}
function validLogprob(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value <= 0 && value > -9999;
}

export function decodeVisualLogprobs(raw: unknown): LogprobDecision {
  const payload = asRecord(raw);
  if (!payload || (payload.status !== 'completed' &&
    !(payload.status === 'incomplete' && asRecord(payload.incomplete_details)?.reason === 'max_output_tokens'))) {
    return unavailableLogprobDecision('Réponse non terminée ou en échec');
  }
  const reasoningTokens = asRecord(asRecord(payload.usage)?.output_tokens_details)?.reasoning_tokens;
  const output = asList(payload.output).map(asRecord);
  if (typeof reasoningTokens === 'number' && reasoningTokens > 0 || output.some(item =>
    item?.type === 'reasoning' && [...asList(item.content), ...asList(item.summary)].some(part => {
      const text = asRecord(part)?.text;
      return typeof text === 'string' && text.trim().length > 0;
    }))) return unavailableLogprobDecision('Thinking observé malgré le mode décisionnel');
  if (output.some(item => !item || (item.type !== 'message' && item.type !== 'reasoning')))
    return unavailableLogprobDecision('Sortie non textuelle ou appel outil inattendu');
  const parts = output.filter(item => item?.type === 'message').flatMap(item => asList(item?.content)).map(asRecord);
  const part = parts.length === 1 && parts[0]?.type === 'output_text' ? parts[0] : undefined;
  const steps = asList(part?.logprobs);
  const step = steps.length === 1 ? asRecord(steps[0]) : undefined;
  const sampled = choice(step?.token);
  if (!part || !step || !sampled || choice(part.text) !== sampled)
    return unavailableLogprobDecision('Un seul token A/B/C/D avec logprobs est requis');
  if (!validLogprob(step.logprob)) return unavailableLogprobDecision('Probabilité du token choisi indisponible');

  // The sampled token can appear again in top_logprobs. Never count it twice.
  const candidates = new Map<string, number>();
  for (const candidate of [step, ...asList(step.top_logprobs).map(asRecord)]) {
    if (typeof candidate?.token !== 'string' || !validLogprob(candidate.logprob)) continue;
    const probability = Math.exp(candidate.logprob);
    const previous = candidates.get(candidate.token);
    if (previous !== undefined && Math.abs(previous - probability) > 1e-6)
      return unavailableLogprobDecision('Probabilités contradictoires pour un token');
    candidates.set(candidate.token, probability);
  }
  const probabilities = emptyDistribution();
  let mass = 0;
  for (const [token, probability] of candidates) {
    mass += probability;
    const label = choice(token);
    if (label) probabilities[label] = (probabilities[label] ?? 0) + probability;
  }
  if (mass > 1 + 1e-5) {
    // Preserve only numeric diagnostics and the closed-choice letter; no raw
    // tokens, copied content or provider payload enter the exported report.
    const observed = [...candidates].map(([token, probability]) =>
      (choice(token) ?? 'autre') + '=' + probability.toPrecision(12)).join(', ');
    const scores = emptyDistribution();
    for (const label of logprobChoices) {
      const probability = probabilities[label];
      if (probability !== null) scores[label] = probability / mass;
    }
    const ranked = [...logprobChoices].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
    const leader = (scores[ranked[0]] ?? 0) > (scores[ranked[1]] ?? 0) + 1e-5 ? ranked[0] : null;
    return { ...unavailableLogprobDecision('Distribution incohérente : masse observée ' +
      (mass * 100).toFixed(6) + ' % (' + candidates.size + ' tokens distincts ; ' + observed + ')'), sampled,
      relativeObservation: { observedMass: mass, scores, leader } };
  }
  const unobservedMass = Math.max(0, 1 - mass);
  // Missing alternatives are NOT zero. Even if every missing token belonged to
  // the runner-up, the winner must remain ahead. No renormalization of A/B/C/D.
  const ranked = [...logprobChoices].sort((a, b) => (probabilities[b] ?? 0) - (probabilities[a] ?? 0));
  const winner = ranked[0];
  const lead = (probabilities[winner] ?? 0) - (probabilities[ranked[1]] ?? 0);
  const verdict = lead > unobservedMass + 1e-5 ? winner : null;
  return { sampled, verdict, probabilities, unobservedMass,
    status: verdict ? 'resolved' : 'ambiguous',
    reason: verdict ? 'Choix dominant parmi les lettres, non calibré' : 'Alternatives trop proches ou masse manquante trop élevée' };
}

export interface LogprobTarget {
  key: string;
  criterionTitle: string;
  criterionDescription: string;
  title: string;
  description: string;
}
/** Generic rubric, no model names, subject-specific rules or expected answer. */
export function logprobQuestion(target: LogprobTarget, context: string): string {
  return [
    'Observe uniquement le travail visible sur les images. Évalue un seul attendu du barème.',
    'Ne déduis pas la présence d’une structure ou d’une relation de ce que le sujet demande : vérifie ce qui est réellement représenté.',
    'Le critère parent situe l’attendu ; ne note pas ses autres exigences.',
    'Contexte : ' + context,
    'Critère parent : ' + target.criterionTitle + ' — ' + target.criterionDescription,
    'Attendu à vérifier : ' + target.title + ' — ' + target.description,
    'A : attendu entièrement satisfait ; B : absent ou non satisfait ; C : partiellement satisfait ; D : impossible à déterminer sur les images.',
    'Réponds par une seule lettre majuscule A, B, C ou D. Aucun commentaire.',
  ].join('\n');
}

