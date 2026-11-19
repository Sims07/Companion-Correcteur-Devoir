import { rubricEvaluationSignature, validateRubric, type Rubric } from './rubric.ts';
import type { ClarifiedRubricVersion } from './rubricClarification.ts';

export interface RubricBaseline {
  rubric: Rubric;
  /** Old histories may have already discarded their true first revision. */
  source: 'initial' | 'retained';
}

function isValidRubric(value: unknown): value is Rubric {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Rubric>;
  if (typeof candidate.title !== 'string' || !Array.isArray(candidate.criteria)) return false;
  try { return validateRubric(candidate as Rubric).valid; }
  catch { return false; }
}

/** Prefer the separately retained original. Legacy history can only prove its earliest surviving revision. */
export function resolveRubricBaseline(stored: unknown, versions: ClarifiedRubricVersion[]): RubricBaseline | null {
  if (stored && typeof stored === 'object') {
    const candidate = stored as Partial<RubricBaseline>;
    if ((candidate.source === 'initial' || candidate.source === 'retained') && isValidRubric(candidate.rubric)) {
      return { source: candidate.source, rubric: structuredClone(candidate.rubric) };
    }
  }
  const earliest = versions[0]?.original;
  return isValidRubric(earliest) ? { source: 'retained', rubric: structuredClone(earliest) } : null;
}

export function createInitialRubricBaseline(rubric: Rubric): RubricBaseline {
  if (!isValidRubric(rubric)) throw new Error('Impossible de conserver ce barème initial invalide.');
  return { source: 'initial', rubric: structuredClone(rubric) };
}

export function rubricIsAtBaseline(rubric: Rubric, baseline: RubricBaseline | null): boolean {
  return !!baseline && rubricEvaluationSignature(rubric) === rubricEvaluationSignature(baseline.rubric);
}

/** Restore the whole teacher-authored structure, without mutating archived snapshots. */
export function restoreRubricBaseline(baseline: RubricBaseline): Rubric {
  if (!isValidRubric(baseline.rubric)) throw new Error('La version sauvegardée est invalide : restauration annulée.');
  return structuredClone(baseline.rubric);
}
