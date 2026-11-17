import { parseModelJson } from '../../shared/domain/modelJson.ts';
import { getRubricSubcriteria, rubricEvaluationSignature, type Rubric } from './rubric.ts';

/** An audit is advice, never an instruction to change a teacher's scoring rules. */
export interface RubricAuditIssue {
  id: string;
  criterionId: string;
  subcriterionId?: string;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  question: string;
  options: string[];
  suggestion: string;
}

export interface RubricAuditReport {
  signature: string;
  issues: RubricAuditIssue[];
  model: string;
}

export interface RubricAuditDecision {
  issueId: string;
  choice: string;
  decision: 'accepted' | 'kept';
}

export interface RubricAuditSession {
  report: RubricAuditReport;
  decisions: RubricAuditDecision[];
}

/** Discard stale advice whenever a rubric's wording or points change. */
export function matchesRubricAudit(report: RubricAuditReport, rubric: Rubric): boolean {
  return report.signature === rubricEvaluationSignature(rubric);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function requiredText(value: unknown, field: string, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) {
    throw new Error('Audit du barème : champ ' + field + ' absent ou trop long.');
  }
  return value.trim();
}

/** Validate model responses against real rubric identifiers: no invented criteria, scores or edits. */
export function parseRubricAudit(raw: string, rubric: Rubric, model: string): RubricAuditReport {
  const parsed = asRecord(parseModelJson(raw));
  if (!parsed || !Array.isArray(parsed.issues) || parsed.issues.length > 30) {
    throw new Error('Audit du barème : réponse JSON invalide.');
  }
  const seen = new Set<string>();
  const issues: RubricAuditIssue[] = parsed.issues.map((item, index) => {
    const value = asRecord(item);
    if (!value) throw new Error('Audit du barème : problème invalide.');
    const suppliedCriterionId = requiredText(value.criterionId, 'criterionId', 160);
    const suppliedSubcriterionId = value.subcriterionId == null || value.subcriterionId === ''
      ? undefined : requiredText(value.subcriterionId, 'subcriterionId', 160);
    let criterion = rubric.criteria.find((entry) => entry.id === suppliedCriterionId);
    let criterionId = suppliedCriterionId;
    let subcriterionId = suppliedSubcriterionId;
    if (!criterion) {
      // Some local models put an EXISTING subcriterion ID into criterionId,
      // e.g. "drawing-clean" instead of {"criterionId":"drawing",
      // "subcriterionId":"drawing-clean"}. Recover only when the match is unique.
      const parents = rubric.criteria.filter((parent) =>
        getRubricSubcriteria(parent).some((sub) => sub.id === suppliedCriterionId));
      const onlyParent = parents[0];
      if (parents.length !== 1 || !onlyParent || (suppliedSubcriterionId && suppliedSubcriterionId !== suppliedCriterionId)) {
        throw new Error('Audit du barème : critère inconnu ou ambigu : ' + suppliedCriterionId);
      }
      criterion = onlyParent;
      criterionId = onlyParent.id;
      subcriterionId = suppliedCriterionId;
    }
    if (subcriterionId && !getRubricSubcriteria(criterion).some((sub) => sub.id === subcriterionId)) {
      throw new Error('Audit du barème : sous-critère inconnu : ' + subcriterionId);
    }
    const priority = value.priority;
    if (priority !== 'high' && priority !== 'medium' && priority !== 'low') {
      throw new Error('Audit du barème : priorité invalide.');
    }
    if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 4) {
      throw new Error('Audit du barème : deux à quatre réponses pédagogiques sont attendues.');
    }
    const options = value.options.map((option) => requiredText(option, 'option', 360));
    if (new Set(options).size !== options.length) throw new Error('Audit du barème : réponses répétées.');
    const id = criterionId + '/' + (subcriterionId ?? '-') + '/' + index;
    const duplicateKey = [criterionId, subcriterionId ?? '', requiredText(value.question, 'question', 600)].join('/');
    if (seen.has(duplicateKey)) throw new Error('Audit du barème : question répétée.');
    seen.add(duplicateKey);
    return {
      id, criterionId, ...(subcriterionId ? { subcriterionId } : {}),
      priority,
      reason: requiredText(value.reason, 'reason', 600),
      question: requiredText(value.question, 'question', 600),
      options,
      suggestion: requiredText(value.suggestion, 'suggestion', 1000),
    };
  });
  const rank = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => rank[a.priority] - rank[b.priority]);
  issues.forEach((issue, index) => { issue.id = issue.criterionId + '/' + (issue.subcriterionId ?? '-') + '/' + index; });
  return { signature: rubricEvaluationSignature(rubric), issues, model };
}

export function validRubricAuditSession(value: unknown, rubric: Rubric): RubricAuditSession | null {
  const session = asRecord(value);
  const report = asRecord(session?.report);
  if (!report || report.signature !== rubricEvaluationSignature(rubric)
    || !Array.isArray(report.issues) || !Array.isArray(session?.decisions)) return null;
  try {
    const parsed = parseRubricAudit(JSON.stringify({ issues: report.issues }), rubric, requiredText(report.model, 'model', 160));
    const validIds = new Set(parsed.issues.map((issue) => issue.id));
    const decisions: RubricAuditDecision[] = [];
    for (const rawDecision of session!.decisions as unknown[]) {
      const choice = asRecord(rawDecision);
      if (!choice || typeof choice.issueId !== 'string' || !validIds.has(choice.issueId)
        || (choice.decision !== 'accepted' && choice.decision !== 'kept')
        || typeof choice.choice !== 'string' || choice.choice.length > 1000) return null;
      decisions.push({ issueId: choice.issueId, decision: choice.decision, choice: choice.choice });
    }
    // IDs remain stable across serialisation when the initial issue order was already sorted.
    return { report: { ...parsed, model: report.model as string }, decisions };
  } catch { return null; }
}
