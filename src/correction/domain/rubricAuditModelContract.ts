import { parseModelJson } from '../../shared/domain/modelJson.ts';
import { getRubricSubcriteria, type Rubric } from './rubric.ts';
import { parseRubricAudit, type RubricAuditReport } from './rubricAudit.ts';

/** Model-visible labels are positional, short and local to one audit.
 * Never send persisted rubric IDs or ask the LLM to reconstruct parent links. */
export function rubricAuditModelInput(rubric: Rubric) {
  return {
    title: rubric.title,
    criteria: rubric.criteria.map((criterion, index) => {
      const ref = `C${index + 1}`;
      return {
        ref, title: criterion.title, description: criterion.description, maxPoints: criterion.maxPoints,
        ...(criterion.analysisMode ? { analysisMode: criterion.analysisMode } : {}),
        ...(criterion.scientificExpectations ? { scientificExpectations: criterion.scientificExpectations } : {}),
        ...(criterion.correctionContract ? { correctionContract: criterion.correctionContract } : {}),
        subcriteria: getRubricSubcriteria(criterion).map((sub, subIndex) => ({
          ref: `${ref}.S${subIndex + 1}`,
          title: sub.title, description: sub.description, maxPoints: sub.maxPoints,
          ...(sub.scientificExpectations ? { scientificExpectations: sub.scientificExpectations } : {}),
        })),
      };
    }),
  };
}

function modelTargets(rubric: Rubric) {
  const targets = new Map<string, { criterionId: string; subcriterionId?: string }>();
  rubric.criteria.forEach((criterion, index) => {
    const ref = `C${index + 1}`;
    targets.set(ref, { criterionId: criterion.id });
    getRubricSubcriteria(criterion).forEach((sub, subIndex) => {
      targets.set(`${ref}.S${subIndex + 1}`, { criterionId: criterion.id, subcriterionId: sub.id });
    });
  });
  return targets;
}

/** Resolve untrusted model references deterministically; only the application
 * knows the real identifiers, and the existing domain parser still validates
 * all proposed text, priorities, duplicates and allowed options. */
export function resolveRubricAuditModelResponse(raw: string, rubric: Rubric): string {
  const payload = parseModelJson(raw);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !Array.isArray((payload as Record<string, unknown>).issues)) {
    throw new Error('Audit du barème : réponse JSON invalide.');
  }
  const targets = modelTargets(rubric);
  const issues = ((payload as Record<string, unknown>).issues as unknown[]).map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Audit du barème : problème invalide.');
    }
    const { ref, ...proposal } = item as Record<string, unknown>;
    if (typeof ref !== 'string' || !targets.has(ref)) {
      throw new Error('Audit du barème : référence de critère inconnue ou manquante : ' + String(ref));
    }
    const target = targets.get(ref)!;
    return { ...proposal, criterionId: target.criterionId, subcriterionId: target.subcriterionId ?? null };
  });
  return JSON.stringify({ issues });
}

/** The diagnostics recovery flow also accepts pre-migration model responses
 * already carrying real rubric IDs. New model requests use only short refs. */
export function parseRecoveredRubricAudit(raw: string, rubric: Rubric, model: string): RubricAuditReport {
  const parsed = parseModelJson(raw);
  const issues = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>).issues : undefined;
  const usesRefs = Array.isArray(issues) && issues.some((item) =>
    item && typeof item === 'object' && !Array.isArray(item) && 'ref' in item);
  return parseRubricAudit(usesRefs ? resolveRubricAuditModelResponse(raw, rubric) : raw, rubric, model);
}
