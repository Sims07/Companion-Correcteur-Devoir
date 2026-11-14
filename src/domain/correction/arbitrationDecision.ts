import { parseModelJson } from '../modelJson.ts';

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
    parsed = parseModelJson(raw);
  } catch {
    throw new Error('La réponse du juge n’est pas un JSON de décisions valide.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Le juge doit retourner un objet JSON exploitable.');
  }
  const root = parsed as Record<string, unknown>;
  const entries = root.decisions ?? root.arbitrages;
  if (!Array.isArray(entries)) throw new Error('La réponse du juge doit contenir un tableau decisions exploitable.');
  const decisions: ArbitrationDecision[] = entries.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Une décision du juge est invalide.');
    const decision = item as Record<string, unknown>;
    const criterionId = decision.criterionId ?? decision.idCritere;
    const choice = decision.selected ?? decision.choix;
    const selected = choice === '1' ? 'avis1' : choice === '2' ? 'avis2' : choice;
    const reason = decision.reason ?? decision.raison ?? '';
    if (typeof criterionId !== 'string' || (selected !== 'avis1' && selected !== 'avis2') || typeof reason !== 'string') {
      throw new Error('Chaque décision du juge doit préciser criterionId et selected (avis1/avis2).');
    }
    const first = firstCriteria.find((criterion) => criterion.criterionId === criterionId);
    const second = secondCriteria.find((criterion) => criterion.criterionId === criterionId);
    if (!first || !second) throw new Error(`Le juge a retourné un critère inconnu : ${criterionId}.`);
    const selectedPoints = selected === 'avis1' ? first.points : second.points;
    if (!Number.isFinite(selectedPoints)) throw new Error(`La note choisie pour ${criterionId} est invalide.`);
    return { criterionId, selected, reason: reason.trim() };
  });
  const actualIds = decisions.map((decision) => decision.criterionId);
  if (new Set(actualIds).size !== actualIds.length) throw new Error('Le juge a retourné plusieurs décisions pour le même critère.');
  if (actualIds.length !== disputedCriterionIds.length || disputedCriterionIds.some((id) => !actualIds.includes(id))) {
    throw new Error('Le juge doit retourner exactement une décision pour chaque critère litigieux.');
  }
  const allowedKeys = new Set(['decisions', 'arbitrages', 'summary', 'resume']);
  if (Object.keys(parsed).some((key) => !allowedKeys.has(key))) throw new Error('Le juge a retourné des champs hors du contrat de décision.');
  return decisions;
}
