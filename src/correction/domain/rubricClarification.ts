import { getRubricSubcriteria, rubricEvaluationSignature, validateRubric, type Rubric } from './rubric.ts';
import { matchesRubricAudit, type RubricAuditDecision, type RubricAuditReport } from './rubricAudit.ts';

export interface ClarifiedRubricVersion {
  appliedAt: string;
  model: string;
  original: Rubric;
  clarified: Rubric;
  decisions: RubricAuditDecision[];
  originalSignature: string;
  clarifiedSignature: string;
}

/** Apply *only* what the professor explicitly approved; never invent or redistribute points. */
export function createClarifiedRubricVersion(
  source: Rubric,
  audit: RubricAuditReport,
  decisions: RubricAuditDecision[],
  appliedAt: string,
): ClarifiedRubricVersion {
  if (!matchesRubricAudit(audit, source)) {
    throw new Error('Le barème a changé depuis cet audit. Relancez la vérification avant application.');
  }
  const accepted = decisions.filter((item) => item.decision === 'accepted');
  if (!accepted.length) throw new Error('Aucune précision validée à appliquer.');
  const issueById = new Map(audit.issues.map((issue) => [issue.id, issue]));
  const entries = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const decision of accepted) {
    const issue = issueById.get(decision.issueId);
    if (!issue || seen.has(decision.issueId) || !decision.choice.trim() || decision.choice.length > 1000) {
      throw new Error('Une décision est introuvable ou invalide : relancez la vérification.');
    }
    seen.add(decision.issueId);
    const key = issue.criterionId + '/' + (issue.subcriterionId ?? '');
    const current = entries.get(key) ?? [];
    current.push('Question : ' + issue.question + '\nDécision du professeur : ' + decision.choice.trim());
    entries.set(key, current);
  }
  const rubric: Rubric = {
    ...source,
    criteria: source.criteria.map((criterion) => {
      const criterionRules = entries.get(criterion.id + '/') ?? [];
      const children = getRubricSubcriteria(criterion);
      const next = {
        ...criterion,
        description: [criterion.description, ...criterionRules].filter(Boolean).join('\n\n'),
        ...(children.length ? {
          subcriteria: children.map((sub) => ({
            ...sub, description: [sub.description, ...(entries.get(criterion.id + '/' + sub.id) ?? [])]
              .filter(Boolean).join('\n\n'),
          })),
          expectedElements: undefined,
        } : {}),
      };
      return next;
    }),
  };
  const originalValidity = validateRubric(source);
  const validity = validateRubric(rubric);
  if (!originalValidity.valid || !validity.valid
    || rubric.criteria.some((criterion, index) => criterion.maxPoints !== source.criteria[index].maxPoints
      || getRubricSubcriteria(criterion).some((sub, subIndex) => sub.maxPoints !== getRubricSubcriteria(source.criteria[index])[subIndex].maxPoints))) {
    throw new Error('La clarification ne doit jamais modifier les notes ni la structure du barème.');
  }
  return {
    appliedAt, model: audit.model, original: structuredClone(source), clarified: rubric,
    decisions: accepted.map((item) => ({ ...item })),
    originalSignature: rubricEvaluationSignature(source),
    clarifiedSignature: rubricEvaluationSignature(rubric),
  };
}


// A human-readable, criterion-level diff for the teacher. Never show an entire
// serialized rubric when only a description gained an approved clarification.
export interface RubricClarificationChange {
  id: string;
  label: string;
  before: string;
  after: string;
  /** Only the appended rule when the previous description was preserved verbatim. */
  addition: string | null;
}

export function getRubricClarificationChanges(version: ClarifiedRubricVersion): RubricClarificationChange[] {
  const changes: RubricClarificationChange[] = [];
  const add = (id: string, label: string, before: string, after: string) => {
    if (before === after) return;
    const addition = before === '' ? after : after.startsWith(before + '\n\n')
      ? after.slice(before.length + 2) : null;
    changes.push({ id, label, before, after, addition });
  };
  for (const criterion of version.clarified.criteria) {
    const original = version.original.criteria.find((item) => item.id === criterion.id);
    if (!original) continue;
    add(criterion.id, criterion.title, original.description, criterion.description);
    for (const sub of getRubricSubcriteria(criterion)) {
      const oldSub = getRubricSubcriteria(original).find((item) => item.id === sub.id);
      if (!oldSub) continue;
      add(criterion.id + '/' + sub.id, criterion.title + ' / ' + sub.title, oldSub.description, sub.description);
    }
  }
  return changes;
}
