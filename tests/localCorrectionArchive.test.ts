import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteLocalCorrection, getLocalCorrection, listLocalCorrectionSummaries, listLocalCorrections, saveLocalCorrection } from '../src/adapters/storage/indexedDbMemory.ts';
import type { LocalCorrection } from '../src/domain/localCorrection.ts';

const correction: LocalCorrection = {
  id: 'archive-integration-1',
  label: 'Étudiant 014',
  rubricTitle: 'Biologie cellulaire',
  rubricFingerprint: 'rubric-biology-1',
  assignmentId: 'assignment-partiel-s1',
  assignmentTitle: 'Partiel S1',
  createdAt: '2026-10-28T10:00:00.000Z',
  updatedAt: '2026-10-28T10:30:00.000Z',
  snapshot: {
    assignmentTitle: 'Partiel S1',
    question: 'Expliquez la mitose.',
    rubric: { title: 'Biologie cellulaire', criteria: [{ id: 'knowledge', title: 'Connaissances', description: 'Exactitude', maxPoints: 4 }] },
    proposal: { summary: 'Réponse globalement correcte.', criteria: [{ criterionId: 'knowledge', points: 3, rationale: 'Bonne explication.', evidence: 'Les phases sont citées.', confidence: 'high' }], questionsForTeacher: [], finalScore: 3 },
    review: [{ criterionId: 'knowledge', points: 3, rationale: 'Bonne explication.', evidence: 'Les phases sont citées.', confidence: 'high', teacherPoints: 3.5, teacherComment: 'Précision apportée.', decision: 'adjusted' }],
    teacherQuestions: '',
    images: [{ base64: 'local-base64-copy', mimeType: 'image/jpeg', fileName: 'page-1.jpg' }],
    originalImages: [{ base64: 'original-base64-copy', mimeType: 'image/jpeg', fileName: 'page-1.jpg' }],
    annotationInkColor: 'red',
    transcription: 'La mitose comprend plusieurs phases.',
    subjectImages: [],
    subjectTranscription: null,
    correctionMode: 'integrated',
    maximumPoints: 4,
    hasScientificDiagrams: true,
    scientificPageClassifications: [{ pageNumber: 1, kind: 'scientific-diagram', confidence: 0.95, reason: 'Schéma de cellule' }],
    scientificDiagramAnalysis: {
      diagrams: [{ id: 'diagram-1', pageNumber: 1, diagramType: 'Cellule', summary: 'Schéma de cellule végétale', criteria: [{ criterionId: 'knowledge', title: 'Connaissances', points: 3, maxPoints: 4, evidence: 'Les structures attendues sont présentes.', confidence: 0.85, requiresTeacherReview: false }], uncertainties: [] }],
      overallUncertainties: [],
    },
  },
};

describe('local correction archive persistence', () => {
  beforeEach(async () => {
    await deleteLocalCorrection(correction.id);
  });

  it('persists the finalized snapshot, including copy pages and teacher-reviewed score', async () => {
    await saveLocalCorrection(correction);

    const saved = await listLocalCorrections();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: correction.id,
      label: 'Étudiant 014',
      assignmentId: 'assignment-partiel-s1',
      assignmentTitle: 'Partiel S1',
      snapshot: {
        question: 'Expliquez la mitose.',
        images: [{ base64: 'local-base64-copy', fileName: 'page-1.jpg' }],
        originalImages: [{ base64: 'original-base64-copy', fileName: 'page-1.jpg' }],
        annotationInkColor: 'red',
        transcription: 'La mitose comprend plusieurs phases.',
        review: [{ teacherPoints: 3.5, teacherComment: 'Précision apportée.', decision: 'adjusted' }],
        hasScientificDiagrams: true,
        scientificPageClassifications: [{ pageNumber: 1, kind: 'scientific-diagram', confidence: 0.95, reason: 'Schéma de cellule' }],
        scientificDiagramAnalysis: { diagrams: [{ id: 'diagram-1', pageNumber: 1, diagramType: 'Cellule', summary: 'Schéma de cellule végétale', criteria: [{ criterionId: 'knowledge', points: 3, maxPoints: 4, evidence: 'Les structures attendues sont présentes.' }] }], overallUncertainties: [] },
      },
    });
  });

  it('lists archived scores and page counts without retaining image bytes, then restores the exact original on demand', async () => {
    const full = {
      ...correction,
      snapshot: {
        ...correction.snapshot!,
        images: [{ base64: 'LARGE_PRIVATE_PAGE_DATA_'.repeat(5000), mimeType: 'image/jpeg' }],
        originalImages: [{ base64: 'ORIGINAL_PRIVATE_PAGE_DATA_'.repeat(5000), mimeType: 'image/jpeg' }],
        subjectImages: [{ base64: 'SUBJECT_PRIVATE_PAGE_DATA_'.repeat(5000), mimeType: 'image/jpeg' }],
      },
    };
    await saveLocalCorrection(full);
    const summaries = await listLocalCorrectionSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: correction.id,
      imagesDeferred: true,
      pageCount: 1,
      snapshot: { images: [], subjectImages: [], maximumPoints: 4, review: [{ teacherPoints: 3.5 }] },
    });
    expect(JSON.stringify(summaries)).not.toContain('PRIVATE_PAGE_DATA_');
    const restored = await getLocalCorrection(correction.id);
    expect(restored).toEqual(full);
    expect(restored?.imagesDeferred).toBeUndefined();
    expect((await listLocalCorrectionSummaries())[0].snapshot?.images).toEqual([]);
    expect(await getLocalCorrection('archive-that-does-not-exist')).toBeNull();
  });

  it('updates an existing archive entry rather than creating duplicates', async () => {
    await saveLocalCorrection(correction);
    await saveLocalCorrection({ ...correction, updatedAt: '2026-10-28T11:00:00.000Z', snapshot: { ...correction.snapshot!, teacherQuestions: 'Vérifier la terminologie.' } });

    const saved = await listLocalCorrections();
    expect(saved).toHaveLength(1);
    expect(saved[0].snapshot?.teacherQuestions).toBe('Vérifier la terminologie.');
  });
});
