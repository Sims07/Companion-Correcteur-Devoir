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

/** Conservative safeguards: only exact duplicates and unambiguous reversals. */
const normalizeDecision = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR');

function opposedScientificStatements(first: string, second: string): boolean {
  const patterns = [
    { positive: /\bpr[eé]sent(?:e|s|es)?\b/g, negative: /\babsent(?:e|s|es)?\b/g },
    { positive: /\bobligatoire\b/g, negative: /\bfacultati(?:f|ve)\b/g },
    { positive: /\bdoit\b/g, negative: /\bne doit pas\b/g },
  ];
  const left = normalizeDecision(first), right = normalizeDecision(second);
  return patterns.some(({ positive, negative }) => {
    const classify = (value: string) => {
      const minus = negative.test(value); negative.lastIndex = 0;
      const plus = !minus && positive.test(value); positive.lastIndex = 0;
      if (!plus && !minus) return null;
      return { positive: plus, context: value.replace(positive, '[état]').replace(negative, '[état]') };
    };
    const a = classify(left), b = classify(right);
    return !!a && !!b && a.positive !== b.positive && a.context === b.context;
  });
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
  const scientificEntries = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const decision of accepted) {
    const issue = issueById.get(decision.issueId);
    if (!issue || seen.has(decision.issueId) || !decision.choice.trim() || decision.choice.length > 1000) {
      throw new Error('Une décision est introuvable ou invalide : relancez la vérification.');
    }
    seen.add(decision.issueId);
    const key = issue.criterionId + '/' + (issue.subcriterionId ?? '');
    const target = issue.kind === 'scientific' ? scientificEntries : entries;
    const current = target.get(key) ?? [];
    // A quick « Oui » to a scientific suggestion must store the actual reference,
    // never the button label. A free-form edit remains authoritative.
    const scientificChoice = issue.kind === 'scientific' && issue.options.includes(decision.choice)
      ? issue.suggestion : decision.choice.trim();
    if (issue.kind === 'scientific' && /^(non|refuser|conserver)/i.test(decision.choice.trim())) {
      throw new Error('Refusez une proposition scientifique avec « Conserver le barème actuel ».');
    }
    const criterion = source.criteria.find((entry) => entry.id === issue.criterionId);
    const previous = issue.subcriterionId && criterion
      ? getRubricSubcriteria(criterion).find((entry) => entry.id === issue.subcriterionId) : criterion;
    if (!previous) throw new Error('Critère introuvable dans le barème.');
    if (issue.kind === 'scientific') {
      const existing = [...(previous.scientificExpectations ?? []), ...current];
      if (existing.some((value) => normalizeDecision(value) === normalizeDecision(scientificChoice))) {
        throw new Error('Cette référence scientifique figure déjà dans le barème. Aucun doublon ne sera ajouté.');
      }
      if (existing.some((value) => opposedScientificStatements(value, scientificChoice))) {
        throw new Error('Références scientifiques potentiellement contradictoires : retirez ou adaptez l’ancienne référence avant application.');
      }
    } else {
      const oldDecisions = [...previous.description.matchAll(/Question : ([^\n]+)\nDécision du professeur : ([^\n]+)/g)];
      const question = normalizeDecision(issue.question);
      const previousAnswers = [
        ...oldDecisions.filter((match) => normalizeDecision(match[1]) === question).map((match) => match[2]),
        ...current.filter((value) => value.startsWith('Question : ' + issue.question + '\n'))
          .map((value) => value.split('Décision du professeur : ')[1] ?? ''),
      ];
      if (previousAnswers.some((value) => normalizeDecision(value) === normalizeDecision(decision.choice))) {
        throw new Error('Cette clarification a déjà été appliquée. Aucun doublon ne sera ajouté.');
      }
      if (previousAnswers.length) {
        throw new Error('Une décision différente existe déjà pour cette question : retirez ou adaptez l’ancienne clarification avant application.');
      }
    }
    current.push(issue.kind === 'scientific' ? scientificChoice
      : 'Question : ' + issue.question + '\nDécision du professeur : ' + decision.choice.trim());
    target.set(key, current);
  }
  const rubric: Rubric = {
    ...source,
    criteria: source.criteria.map((criterion) => {
      const criterionRules = entries.get(criterion.id + '/') ?? [];
      const criterionScience = scientificEntries.get(criterion.id + '/') ?? [];
      const children = getRubricSubcriteria(criterion);
      const next = {
        ...criterion,
        description: [criterion.description, ...criterionRules].filter(Boolean).join('\n\n'),
        ...(criterionScience.length ? { scientificExpectations: [...new Set([...(criterion.scientificExpectations ?? []), ...criterionScience])] } : {}),
        ...(children.length ? {
          subcriteria: children.map((sub) => ({
            ...sub, description: [sub.description, ...(entries.get(criterion.id + '/' + sub.id) ?? [])]
              .filter(Boolean).join('\n\n'),
            ...(scientificEntries.has(criterion.id + '/' + sub.id) ? { scientificExpectations: [...new Set([
              ...(sub.scientificExpectations ?? []), ...(scientificEntries.get(criterion.id + '/' + sub.id) ?? []),
            ])] } : {}),
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
  kind?: 'scientific';
}

export function getRubricClarificationChanges(version: ClarifiedRubricVersion): RubricClarificationChange[] {
  const changes: RubricClarificationChange[] = [];
  const add = (id: string, label: string, before: string, after: string, kind?: 'scientific') => {
    if (before === after) return;
    const addition = before === '' ? after : after.startsWith(before + '\n\n')
      ? after.slice(before.length + 2) : null;
    changes.push({ id: kind ? id + '/scientific' : id, label, before, after, addition, ...(kind ? { kind } : {}) });
  };
  for (const criterion of version.clarified.criteria) {
    const original = version.original.criteria.find((item) => item.id === criterion.id);
    if (!original) continue;
    add(criterion.id, criterion.title, original.description, criterion.description);
    add(criterion.id, criterion.title, (original.scientificExpectations ?? []).join('\n'),
      (criterion.scientificExpectations ?? []).join('\n'), 'scientific');
    for (const sub of getRubricSubcriteria(criterion)) {
      const oldSub = getRubricSubcriteria(original).find((item) => item.id === sub.id);
      if (!oldSub) continue;
      add(criterion.id + '/' + sub.id, criterion.title + ' / ' + sub.title, oldSub.description, sub.description);
      add(criterion.id + '/' + sub.id, criterion.title + ' / ' + sub.title,
        (oldSub.scientificExpectations ?? []).join('\n'), (sub.scientificExpectations ?? []).join('\n'), 'scientific');
    }
  }
  return changes;
}
