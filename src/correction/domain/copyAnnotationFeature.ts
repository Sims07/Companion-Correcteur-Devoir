import type { ReviewedCriterion } from './grading.ts';

/** UI preference, deliberately independent of the LLM model/profile. */
export const COPY_ANNOTATIONS_SETTING_KEY = 'companion-correcteur:copy-annotations-enabled:v1';

/** Only an explicit opt-in activates annotations (including for older users). */
export function parseCopyAnnotationsEnabled(stored: unknown): boolean {
  return stored === 'true';
}

export interface CopyAnnotationPlacement {
  pageNumber: number;
  /** Coordinates normalized against the displayed page, from 0 to 1000. */
  x: number;
  y: number;
}

/** Grading remains authoritative: only an actual deduction with an explicit
 * teacher-facing remark can become a mark on the student's page. */
export function copyAnnotationMessage(
  item: Pick<ReviewedCriterion, 'teacherPoints' | 'teacherComment' | 'annotationSuggestion' | 'assessmentStatus'>,
  maximum: number,
): string | null {
  if (item.assessmentStatus === 'not-evaluated' || !Number.isFinite(maximum) || !(item.teacherPoints < maximum)) return null;
  const message = item.teacherComment.trim() || item.annotationSuggestion?.trim() || '';
  return message || null;
}

/** The UI—not the LLM—normalizes a teacher-selected location on the visible image. */
export function placementFromPageClick(
  pageNumber: number,
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): CopyAnnotationPlacement | null {
  if (!Number.isInteger(pageNumber) || pageNumber < 1
    || ![clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0) return null;
  const x = Math.max(0, Math.min(1000, Math.round((clientX - rect.left) / rect.width * 1000)));
  const y = Math.max(0, Math.min(1000, Math.round((clientY - rect.top) / rect.height * 1000)));
  return { pageNumber, x, y };
}

export function isCopyAnnotationPlacement(value: unknown): value is CopyAnnotationPlacement {
  if (!value || typeof value !== 'object') return false;
  const placement = value as Record<string, unknown>;
  return Number.isInteger(placement.pageNumber) && (placement.pageNumber as number) > 0
    && Number.isInteger(placement.x) && (placement.x as number) >= 0 && (placement.x as number) <= 1000
    && Number.isInteger(placement.y) && (placement.y as number) >= 0 && (placement.y as number) <= 1000;
}
