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

export function copyAnnotationMessage(item: Pick<ReviewedCriterion, 'teacherComment' | 'annotationSuggestion'>): string {
  return (item.annotationSuggestion?.trim() || item.teacherComment.trim()).slice(0, MAX_COPY_ANNOTATION_LENGTH);
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

export type CopyAnnotationTone = 'positive' | 'improvement';

export function copyAnnotationToneLabel(tone: unknown): string {
  return tone === 'positive' ? 'Réussite' : tone === 'improvement' ? 'À améliorer' : 'Non qualifiée';
}

export interface CopyAnnotation {
  id: string;
  message: string;
  tone?: CopyAnnotationTone;
  criterionId?: string;
  placement?: CopyAnnotationPlacement;
  status: 'accepted' | 'suggested';
}

export const MAX_COPY_ANNOTATION_LENGTH = 240;

export function restoreCopyAnnotations(saved: CopyAnnotation[] | undefined, review: readonly ReviewedCriterion[]): CopyAnnotation[] {
  if (saved) return saved;
  return review.flatMap((item) => {
    const message = item.teacherComment.trim() || item.annotationSuggestion?.trim();
    return message && isCopyAnnotationPlacement(item.annotationPlacement)
      ? [{ id: `legacy-${item.criterionId}`, message, criterionId: item.criterionId, placement: item.annotationPlacement, status: 'accepted' as const }]
      : [];
  });
}

export function placeAnnotationsAfterRotation(
  annotations: CopyAnnotation[], pageNumber: number, degrees: 90 | 180 | 270,
): CopyAnnotation[] {
  return annotations.map((annotation) => {
    const placement = annotation.placement;
    if (placement?.pageNumber !== pageNumber) return annotation;
    const { x, y } = placement;
    const point = degrees === 90 ? { x: 1000 - y, y: x }
      : degrees === 180 ? { x: 1000 - x, y: 1000 - y } : { x: y, y: 1000 - x };
    return { ...annotation, placement: { pageNumber, ...point } };
  });
}

export function placeAnnotationsAfterPageRemoval(annotations: CopyAnnotation[], pageNumber: number): CopyAnnotation[] {
  return annotations.map((annotation) => {
    const placement = annotation.placement;
    if (!placement || placement.pageNumber < pageNumber) return annotation;
    return { ...annotation, placement: placement.pageNumber === pageNumber ? undefined : { ...placement, pageNumber: placement.pageNumber - 1 } };
  });
}
