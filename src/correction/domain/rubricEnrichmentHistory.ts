import { getRubricSubcriteria, type Rubric, type RubricCriterion, type RubricSubcriterion } from './rubric.ts';
import { getRubricClarificationChanges, type ClarifiedRubricVersion, type RubricClarificationChange } from './rubricClarification.ts';

export interface AppliedRubricEnrichment {
  id: string;
  criterionId: string;
  subcriterionId?: string;
  kind: 'clarification' | 'scientific';
  text: string;
  model: string;
  appliedAt: string;
  /** Position in the retained local history, not a globally unique revision number. */
  historyIndex: number;
}

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR');

function findItem(rubric: Rubric, criterionId: string, subcriterionId?: string) {
  const criterion = rubric.criteria.find((item) => item.id === criterionId);
  return subcriterionId && criterion ? getRubricSubcriteria(criterion).find((item) => item.id === subcriterionId) : criterion;
}

function approvedBlocks(change: RubricClarificationChange): string[] {
  // Existing clarifications are stored as complete Question/Decision paragraphs.
  // Keep each paragraph independently removable without touching teacher text.
  return change.addition?.split(/\n\n(?=Question : )/).filter(Boolean) ?? [];
}

/** Reconstruct provenance from locally archived before/after snapshots, including old archives. */
export function listAppliedRubricEnrichments(
  rubric: Rubric, versions: ClarifiedRubricVersion[],
): AppliedRubricEnrichment[] {
  const entries: AppliedRubricEnrichment[] = [];
  const recorded = new Set<string>();
  const record = (
    criterionId: string, subcriterionId: string | undefined,
    kind: AppliedRubricEnrichment['kind'], text: string, version: ClarifiedRubricVersion, historyIndex: number,
  ) => {
    const current = findItem(rubric, criterionId, subcriterionId);
    if (!current || !text.trim()) return;
    const isPresent = kind === 'scientific'
      ? (current.scientificExpectations ?? []).some((value) => normalize(value) === normalize(text))
      : current.description.includes(text);
    if (!isPresent) return;
    const key = [criterionId, subcriterionId ?? '', kind, normalize(text)].join('|');
    if (recorded.has(key)) return;
    recorded.add(key);
    entries.push({
      id: key, criterionId, ...(subcriterionId ? { subcriterionId } : {}), kind, text,
      model: version.model, appliedAt: version.appliedAt, historyIndex,
    });
  };

  versions.forEach((version, index) => {
    const historyIndex = index + 1;
    for (const criterion of version.clarified.criteria) {
      const before = version.original.criteria.find((item) => item.id === criterion.id);
      if (!before) continue;
      const newScience = (criterion.scientificExpectations ?? []).filter(
        (value) => !(before.scientificExpectations ?? []).some((old) => normalize(old) === normalize(value)),
      );
      newScience.forEach((value) => record(criterion.id, undefined, 'scientific', value, version, historyIndex));
      for (const sub of getRubricSubcriteria(criterion)) {
        const oldSub = getRubricSubcriteria(before).find((item) => item.id === sub.id);
        const additions = (sub.scientificExpectations ?? []).filter(
          (value) => !(oldSub?.scientificExpectations ?? []).some((old) => normalize(old) === normalize(value)),
        );
        additions.forEach((value) => record(criterion.id, sub.id, 'scientific', value, version, historyIndex));
      }
    }
    for (const change of getRubricClarificationChanges(version)) {
      if (change.kind === 'scientific') continue;
      const [criterionId, subcriterionId] = change.id.split('/');
      approvedBlocks(change).forEach((value) =>
        record(criterionId, subcriterionId, 'clarification', value, version, historyIndex));
    }
  });
  return entries;
}

/** Remove one approved addition without rewriting the other criteria or changing points. */
export function removeAppliedRubricEnrichment(
  rubric: Rubric, versions: ClarifiedRubricVersion[], selected: AppliedRubricEnrichment,
): Rubric {
  const authorized = listAppliedRubricEnrichments(rubric, versions).find((entry) => entry.id === selected.id);
  if (!authorized) throw new Error('Cet ajout n’est plus présent dans le barème actif.');
  const update = <T extends RubricCriterion | RubricSubcriterion>(item: T): T => {
    if (authorized.kind === 'scientific') {
      const remaining = (item.scientificExpectations ?? []).filter(
        (value) => normalize(value) !== normalize(authorized.text),
      );
      const next = { ...item };
      if (remaining.length) next.scientificExpectations = remaining;
      else delete next.scientificExpectations;
      return next as T;
    }
    const description = item.description;
    // Only delete the recorded, exact Question/Decision paragraph, never an arbitrary
    // same-worded fragment inside the teacher's authored description.
    const suffix = '\n\n' + authorized.text;
    if (description.includes(suffix)) {
      return { ...item, description: description.replace(suffix, '') } as T;
    }
    if (description.startsWith(authorized.text + '\n\n')) {
      return { ...item, description: description.slice(authorized.text.length + 2) } as T;
    }
    if (description === authorized.text) return { ...item, description: '' } as T;
    throw new Error('Le texte a été modifié manuellement : retirez cette précision depuis la description.');
  };
  return {
    ...rubric,
    criteria: rubric.criteria.map((criterion) => {
      if (criterion.id !== authorized.criterionId) return criterion;
      if (!authorized.subcriterionId) return update(criterion);
      return {
        ...criterion,
        subcriteria: getRubricSubcriteria(criterion).map((sub) =>
          sub.id === authorized.subcriterionId ? update(sub) : sub),
        expectedElements: undefined,
      };
    }),
  };
}

/** Total current changes relative to the earliest archived pre-audit snapshot. */
export function getCumulativeRubricChanges(
  rubric: Rubric, versions: ClarifiedRubricVersion[], baseline?: Rubric,
): RubricClarificationChange[] {
  if (!versions.length) return [];
  return getRubricClarificationChanges({ ...versions[0], original: baseline ?? versions[0].original, clarified: rubric });
}
