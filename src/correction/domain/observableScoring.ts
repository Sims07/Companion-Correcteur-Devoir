/** Small set of observable, teacher-authored binary rules. No generic sentiment
 * parser: a negative word in arbitrary scientific evidence is not a scoring rule. */
export interface TitleEmphasisObservations {
  underlined: boolean;
  framed: boolean;
  uppercase: boolean;
}

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
}

export function isTitleEmphasisRequirement(title: string): boolean {
  const name = normalized(title);
  return name.includes('soulign') && name.includes('encadr') && name.includes('majusc');
}

/** A type-safe, explicit observation can be scored without trusting model-supplied points. */
export function readTitleEmphasisObservations(value: unknown): TitleEmphasisObservations | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const found = value as Record<string, unknown>;
  if (typeof found.underlined !== 'boolean' || typeof found.framed !== 'boolean'
    || typeof found.uppercase !== 'boolean') return null;
  return { underlined: found.underlined, framed: found.framed, uppercase: found.uppercase };
}

/** Very narrow French negative evidence guard for a known 3-way OR rule. */
export function explicitTitleEmphasisAbsence(evidence: string): boolean {
  const text = normalized(evidence);
  return /\bminuscul(?:e|es)\b|\baucune? majuscule|\bsans majuscule|\bpas en majuscules?/.test(text)
    && /\b(?:sans|ni|aucun|pas de?) soulign/.test(text)
    && /\b(?:sans|ni|aucun|pas de?) encadr/.test(text);
}

function explicitTitlePlacementAbove(title: string, evidence: string): boolean {
  const name = normalized(title);
  if (!name.includes('dessous') || !name.includes('place')) return false;
  const text = normalized(evidence);
  if (/titre.{0,35}(?:n.est pas|n'est pas|pas du tout).{0,18}au[- ]dessus/.test(text)) return false;
  return /titre(?: principal| descriptif)?\b.{0,45}(?:au[- ]dessus|en haut)/.test(text);
}

export interface EvidenceScoreDecision {
  points: number;
  needsReview: boolean;
  reason: string | null;
}

/** Apply established, easily observable conditions and flag model disagreements.
 * Never manufacture a passing observation when an image or text is uncertain. */
export function evaluateObservableScore(
  title: string, evidence: string, proposedPoints: number, maximum: number,
  observations?: unknown,
): EvidenceScoreDecision {
  if (isTitleEmphasisRequirement(title)) {
    const observation = readTitleEmphasisObservations(observations);
    const negative = explicitTitleEmphasisAbsence(evidence);
    if (observation) {
      const observed = observation.underlined || observation.framed || observation.uppercase;
      const computed = negative ? 0 : observed ? maximum : 0;
      if (Math.abs(computed - proposedPoints) > 0.0001 || (negative && observed)) {
        return { points: computed, needsReview: true,
          reason: 'La règle « souligné OU encadré OU en majuscules » contredit la note ou la preuve produite ; vérifiez le titre principal.' };
      }
      return { points: computed, needsReview: false, reason: null };
    }
    // Historical/legacy outputs may not supply structured facts yet.
    if (negative && proposedPoints > 0) {
      return { points: 0, needsReview: true,
        reason: 'La preuve indique un titre en minuscules, ni souligné ni encadré, mais le modèle lui a accordé des points. Vérifiez ce constat sur la copie.' };
    }
  }
  if (explicitTitlePlacementAbove(title, evidence) && proposedPoints > 0) {
    return { points: 0, needsReview: true,
      reason: 'La preuve situe le titre au-dessus alors que les points exigent un titre placé en dessous.' };
  }
  return { points: proposedPoints, needsReview: false, reason: null };
}
