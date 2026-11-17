import { createBackgroundCorrection, type BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';
import type { LocalCorrection } from '../domain/localCorrection.ts';
import type { Rubric } from '../domain/rubric.ts';
import type { CorrectionMethod } from '../../shared/domain/correctionMethod.ts';

/** A new attempt must use the current assignment, never the archived grading criteria. */
export interface RegradingAssignment {
  id: string;
  question: string;
  rubric: Rubric;
  correctionMode: 'integrated' | 'separate';
  isScientificDiagram: boolean;
}

export interface RegradingOptions {
  id: string;
  now: string;
  visionModel: string;
  analysisModel: string;
  thinking: boolean;
  correctionMethod?: CorrectionMethod;
}

/**
 * Regrade from locally archived working images. The already cleaned/rotated
 * pages are used as both the working and rotation source: falling back to the
 * older raw originalImages could reintroduce removed teacher annotations.
 */
export function createRegradingJob(
  correction: LocalCorrection,
  assignment: RegradingAssignment,
  options: RegradingOptions,
): BackgroundCorrectionJob {
  if (correction.assignmentId && correction.assignmentId !== assignment.id) {
    throw new Error('Cette correction appartient à un autre devoir.');
  }
  const snapshot = correction.snapshot;
  if (!snapshot || correction.imagesDeferred || !snapshot.images.length ||
      snapshot.images.some((image) => !image.base64)) {
    throw new Error('Les images de cette correction ne sont plus disponibles localement.');
  }
  if (!assignment.rubric.criteria.length) {
    throw new Error('Définissez un barème avant de recorriger cette copie.');
  }
  if (assignment.correctionMode === 'separate' &&
      !snapshot.subjectImages.length && !snapshot.subjectTranscription) {
    throw new Error('Le sujet de référence de cette correction est introuvable.');
  }

  return createBackgroundCorrection({
    id: options.id,
    assignmentId: assignment.id,
    regradeOfCorrectionId: correction.id,
    label: correction.label,
    question: assignment.question,
    rubric: structuredClone(assignment.rubric),
    correctionMode: assignment.correctionMode,
    ...(assignment.isScientificDiagram ? { gradingFlow: 'scientific-diagram-direct' as const } : {}),
    images: structuredClone(snapshot.images),
    originalImages: structuredClone(snapshot.images),
    subjectImages: structuredClone(snapshot.subjectImages),
    ...(snapshot.subjectTranscription ? { subjectTranscription: snapshot.subjectTranscription } : {}),
    detectTeacherAnnotations: false,
    annotationInkColor: 'none',
    annotationInkColorApplied: true,
    visionModel: options.visionModel,
    analysisModel: options.analysisModel,
    thinking: options.thinking,
    correctionMethod: options.correctionMethod,
    createdAt: options.now,
    updatedAt: options.now,
  });
}
