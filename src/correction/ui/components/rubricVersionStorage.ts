import { resolveRubricBaseline, type RubricBaseline } from '../../domain/rubricBaseline.ts';
import type { ClarifiedRubricVersion } from '../../domain/rubricClarification.ts';

export const versionsKey = (assignmentId: string) => 'companion-correcteur:rubric-versions:v1:' + assignmentId;
export const baselineKey = (assignmentId: string) => 'companion-correcteur:rubric-baseline:v1:' + assignmentId;

export function loadVersions(assignmentId: string): ClarifiedRubricVersion[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(versionsKey(assignmentId)) ?? '[]') as unknown;
    return Array.isArray(saved) ? saved.filter((item): item is ClarifiedRubricVersion =>
      item && typeof item === 'object' && typeof item.appliedAt === 'string'
      && typeof item.originalSignature === 'string' && typeof item.clarifiedSignature === 'string'
      && Array.isArray(item.original?.criteria) && Array.isArray(item.clarified?.criteria)
      && Array.isArray(item.decisions)) : [];
  } catch { return []; }
}

export function loadBaseline(assignmentId: string, versions: ClarifiedRubricVersion[]): RubricBaseline | null {
  try {
    const saved = window.localStorage.getItem(baselineKey(assignmentId));
    return resolveRubricBaseline(saved ? JSON.parse(saved) : null, versions);
  } catch { return resolveRubricBaseline(null, versions); }
}

