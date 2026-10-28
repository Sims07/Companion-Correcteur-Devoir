export type ArbitrationSelection = 'avis1' | 'avis2';

export interface ArbitrationDecision {
  criterionId: string;
  selected: ArbitrationSelection;
  reason: string;
}

/** Parse the judge's deliberately small decision contract and enforce that it can only select an existing score. */
export function parseArbitrationDecisions(
  raw: string,
  disputedCriterionIds: string[],
  firstCriteria: Array<{ criterionId: string; points: number }>,
  secondCriteria: Array<{ criterionId: string; points: number }>,
): ArbitrationDecision[] {
  let parsed: unknown;
  try {
    const cleaned = raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('La réponse du juge n’est pas un JSON de décisions valide.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('decisions' in parsed) || !Array.isArray(parsed.decisions)) {
    throw new Error('La réponse du juge doit contenir un tableau decisions exploitable.');
  }
  const decisions: ArbitrationDecision[] = parsed.decisions.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Une décision du juge est invalide.');
    const decision = item as Record<string, unknown>;
    if (typeof decision.criterionId !== 'string' || (decision.selected !== 'avis1' && decision.selected !== 'avis2') || typeof decision.reason !== 'string' || !decision.reason.trim()) {
      throw new Error('Chaque décision du juge doit préciser criterionId, selected (avis1/avis2) et reason.');
    }
    const first = firstCriteria.find((criterion) => criterion.criterionId === decision.criterionId);
    const second = secondCriteria.find((criterion) => criterion.criterionId === decision.criterionId);
    if (!first || !second) throw new Error(`Le juge a retourné un critère inconnu : ${decision.criterionId}.`);
    const selectedPoints = decision.selected === 'avis1' ? first.points : second.points;
    if (!Number.isFinite(selectedPoints)) throw new Error(`La note choisie pour ${decision.criterionId} est invalide.`);
    return { criterionId: decision.criterionId, selected: decision.selected, reason: decision.reason.trim() };
  });
  const actualIds = decisions.map((decision) => decision.criterionId);
  if (new Set(actualIds).size !== actualIds.length) throw new Error('Le juge a retourné plusieurs décisions pour le même critère.');
  if (actualIds.length !== disputedCriterionIds.length || disputedCriterionIds.some((id) => !actualIds.includes(id))) {
    throw new Error('Le juge doit retourner exactement une décision pour chaque critère litigieux.');
  }
  const allowedKeys = new Set(['decisions']);
  if (Object.keys(parsed).some((key) => !allowedKeys.has(key))) throw new Error('Le juge a retourné des champs hors du contrat de décision.');
  return decisions;
}
