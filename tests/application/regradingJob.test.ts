import { describe, expect, it } from 'vitest';
import { createRegradingJob } from '../../src/correction/application/regradingJob.ts';
import type { LocalCorrection } from '../../src/correction/domain/localCorrection.ts';
import type { RegradingAssignment, RegradingOptions } from '../../src/correction/application/regradingJob.ts';

const oldRubric = { title: 'Ancien barème', criteria: [{ id: 'old', title: 'Ancien critère', description: '', maxPoints: 4 }] };
const newRubric = { title: 'Nouveau barème', criteria: [{ id: 'new', title: 'Nouveau critère', description: '', maxPoints: 10 }] };
const page = { base64: 'Y29waWU=', mimeType: 'image/png', fileName: 'page.png' };
const markedPage = { base64: 'YW5ub3RhdGlvbnM=', mimeType: 'image/png', fileName: 'original.png' };
const archived: LocalCorrection = {
  id: 'validated-1', assignmentId: 'assignment-1', label: 'Copie validée',
  rubricTitle: oldRubric.title, rubricFingerprint: 'old-fingerprint',
  createdAt: '2026-11-01T09:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z',
  snapshot: {
    assignmentTitle: 'Biologie', question: 'Ancienne consigne', rubric: oldRubric,
    proposal: { summary: '', criteria: [], questionsForTeacher: [], finalScore: 3 },
    review: [], teacherQuestions: '', images: [page], originalImages: [markedPage],
    transcription: 'ancienne transcription', subjectImages: [], subjectTranscription: null,
    correctionMode: 'integrated', maximumPoints: 4,
    detectTeacherAnnotations: true, annotationInkColor: 'red',
  },
};
const assignment: RegradingAssignment = {
  id: 'assignment-1', question: 'Consigne actuelle', rubric: newRubric,
  correctionMode: 'integrated', isScientificDiagram: false,
};
const options: RegradingOptions = {
  id: 'regrade-job-1', now: '2026-11-17T09:00:00.000Z',
  visionModel: 'vision', analysisModel: 'analysis', thinking: false,
};

describe('createRegradingJob', () => {
  it('creates a fresh pending attempt from the saved pages with the current rubric, preserving the archive', () => {
    const before = structuredClone(archived);
    const job = createRegradingJob(archived, assignment, options);
    expect(job).toMatchObject({
      id: 'regrade-job-1', assignmentId: 'assignment-1',
      regradeOfCorrectionId: 'validated-1', label: 'Copie validée',
      rubric: newRubric, question: 'Consigne actuelle',
      status: 'pending', transcription: null, proposal: null,
      partialCriteria: [], completedCriteria: 0, totalCriteria: 1,
      detectTeacherAnnotations: true, annotationInkColor: 'none', annotationInkColorApplied: true,
    });
    expect(job.images).toEqual([page]);
    expect(job.originalImages).toEqual([page]); // no teacher-ink regression
    job.images[0]!.base64 = 'changed';
    job.rubric.criteria[0]!.title = 'changed';
    expect(archived).toEqual(before);
    expect(assignment.rubric).toEqual(newRubric);
  });

  it('uses the diagram direct flow and preserves a separate reference subject', () => {
    const diagram = createRegradingJob(archived, { ...assignment, isScientificDiagram: true }, options);
    expect(diagram.gradingFlow).toBe('scientific-diagram-direct');
    const separate = createRegradingJob({
      ...archived, snapshot: { ...archived.snapshot!, subjectImages: [page], subjectTranscription: 'Sujet lu' },
    }, { ...assignment, correctionMode: 'separate' }, options);
    expect(separate.subjectImages).toEqual([page]);
    expect(separate.subjectTranscription).toBe('Sujet lu');
    expect(separate.correctionMode).toBe('separate');
  });

  it('rejects an absent/deferred archive and does not silently change assignments', () => {
    expect(() => createRegradingJob({ ...archived, imagesDeferred: true }, assignment, options)).toThrow('images');
    expect(() => createRegradingJob({ ...archived, snapshot: undefined }, assignment, options)).toThrow('images');
    expect(() => createRegradingJob({ ...archived, snapshot: { ...archived.snapshot!, images: [] } }, assignment, options)).toThrow('images');
    expect(() => createRegradingJob(archived, { ...assignment, id: 'another' }, options)).toThrow('autre devoir');
    expect(() => createRegradingJob(archived, { ...assignment, rubric: { ...newRubric, criteria: [] } }, options)).toThrow('barème');
    expect(() => createRegradingJob(archived, { ...assignment, correctionMode: 'separate' }, options)).toThrow('sujet de référence');
  });
});
