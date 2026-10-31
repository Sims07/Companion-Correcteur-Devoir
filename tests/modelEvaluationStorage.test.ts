import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteModelEvaluation, listDiagnosticHistory, listModelEvaluations, saveDiagnosticHistory, saveModelEvaluation } from '../src/adapters/storage/indexedDbMemory.ts';
import type { ModelEvaluationRecord } from '../src/domain/modelEvaluation.ts';

const record: ModelEvaluationRecord = {
  id: 'evaluation-1',
  completedAt: '2026-10-29T10:00:00.000Z',
  assignmentId: 'biology-midterm',
  assignmentTitle: 'Partiel de biologie',
  question: 'Expliquez la mitose.',
  rubricSnapshot: { title: 'Biologie', criteria: [{ id: 'knowledge', title: 'Connaissances', description: '', maxPoints: 4 }] },
  correctionMode: 'integrated',
  images: [{ base64: 'original-student-copy-image', mimeType: 'image/jpeg', fileName: 'page-1.jpg' }],
  subjectImages: [],
  subjectTranscription: null,
  configurations: [
    { id: 'profile-1', name: 'Gemma / Qwen', endpoint: 'http://localhost:11434', visionModel: 'gemma3:4b', analysisModel: 'qwen3.5:4b', thinking: false },
  ],
  results: [{
    profileId: 'profile-1', profileName: 'Gemma / Qwen', elapsedMs: 42000, readingMs: 12000, analysisMs: 30000,
    tokens: 1234, status: 'success', transcription: 'La mitose comporte quatre phases.', raw: '{"criteria":[]}',
    score: 3, proposal: { summary: 'Partiel', questionsForTeacher: [], criteria: [{ criterionId: 'knowledge', points: 3, rationale: 'Deux phases sont bien expliquées.', evidence: 'prophase et métaphase', confidence: 'medium' }], finalScore: 3 },
  }],
};

describe('local model evaluation archive', () => {
  beforeEach(async () => {
    await deleteModelEvaluation(record.id);
  });

  it('persists original images, rubric/configuration snapshots, and per-model outputs locally', async () => {
    await saveModelEvaluation(record);
    const saved = await listModelEvaluations();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: record.id,
      assignmentTitle: 'Partiel de biologie',
      images: [{ base64: 'original-student-copy-image', fileName: 'page-1.jpg' }],
      configurations: [{ visionModel: 'gemma3:4b', analysisModel: 'qwen3.5:4b' }],
      results: [{ score: 3, readingMs: 12000, analysisMs: 30000, tokens: 1234, proposal: { criteria: [{ evidence: 'prophase et métaphase' }] } }],
    });
  });

  it('updates a saved experiment and sorts history newest first', async () => {
    await saveModelEvaluation(record);
    await saveModelEvaluation({ ...record, completedAt: '2026-10-29T11:00:00.000Z', assignmentTitle: 'Updated title' });
    await saveModelEvaluation({ ...record, id: 'evaluation-2', completedAt: '2026-10-29T12:00:00.000Z' });
    const saved = await listModelEvaluations();
    expect(saved.map((item) => item.id)).toEqual(['evaluation-2', 'evaluation-1']);
    expect(saved[1].assignmentTitle).toBe('Updated title');
  });

  it('stores full diagnostic traces with prompts and raw responses in IndexedDB', async () => {
    const trace = {
      id: 'diagnostic-1',
      completedAt: '2026-10-31T10:00:00.000Z',
      requestPrompt: 'Analyse cette copie selon le barème',
      requestPayload: JSON.stringify({ rubric: { title: 'Biologie' } }),
      raw: '{"score":12}',
    };
    await saveDiagnosticHistory([trace]);
    await expect(listDiagnosticHistory<typeof trace>()).resolves.toEqual([trace]);
    await saveDiagnosticHistory([]);
    await expect(listDiagnosticHistory<typeof trace>()).resolves.toEqual([]);
  });

  it('deletes one local evaluation without deleting the remaining history', async () => {
    await saveModelEvaluation(record);
    await saveModelEvaluation({ ...record, id: 'evaluation-2' });
    await deleteModelEvaluation(record.id);
    expect((await listModelEvaluations()).map((item) => item.id)).toEqual(['evaluation-2']);
  });
});
