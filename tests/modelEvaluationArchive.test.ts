import { describe, expect, it, vi } from 'vitest';
import {
  compactModelEvaluationRecord, explainModelEvaluationStorageError,
  modelEvaluationImageSignature, saveModelEvaluationWithFallback,
} from '../src/domain/modelEvaluationArchive.ts';
import { canCompareModelEvaluationRecords, type ModelEvaluationRecord } from '../src/domain/modelEvaluation.ts';

const makeRecord = (id: string, imageBytes = 'long-copy-image') : ModelEvaluationRecord => ({
  id, completedAt:'2026-11-05T17:30:00Z',
  assignmentId:'biology', assignmentTitle:'Devoir de biologie', question:'Biologie',
  rubricSnapshot:{ title:'Biologie', criteria:[{id:'criterion-1',title:'Génétique',description:'ADN',maxPoints:20}] },
  correctionMode:'integrated',
  images:[{mimeType:'image/jpeg',base64:imageBytes,fileName:'copie.jpg'}],
  subjectImages:[{mimeType:'image/jpeg',base64:'subject-pdf-page',fileName:'sujet.jpg'}],
  subjectTranscription:'Sujet de biologie',
  configurations:[{id:'config-1',name:id,endpoint:'http://localhost:11434',visionModel:'gemma3:4b',analysisModel:'d1:3b',thinking:false}],
  results:[{
    profileId:'config-1',profileName:id,elapsedMs:134000,readingMs:24000,analysisMs:110000,
    status:'success',tokens:5000,score:11.75,transcription:'ADN',raw:'{"result":"ok"}',
    proposal:{summary:'',criteria:[{criterionId:'criterion-1',points:11.75,rationale:'',evidence:'ADN',confidence:'low'}],questionsForTeacher:[],finalScore:11.75},
    diagnosticRuns:[{kind:'model',stage:'analysis',model:'d1:3b',raw:'{"answers":{}}',elapsedMs:110000,requestPayload:'{"questions":{}}'}],
  }],
  stage:'integrated',
});

describe('model evaluation history storage recovery', () => {
  it('persists complete images if IndexedDB works', async () => {
    const record=makeRecord('d1');
    const save=vi.fn(async (_value: ModelEvaluationRecord) => {});
    const result=await saveModelEvaluationWithFallback(record,save);
    expect(result.mode).toBe('complete');
    expect(result.record.images[0]?.base64).toBe('long-copy-image');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('recovers from quota errors without losing the grades, transcription, raw responses or diagnostics', async () => {
    const record=makeRecord('tev');
    const save=vi.fn(async (value: ModelEvaluationRecord) => {
      if (value.images.some((image)=> image.base64)) throw new DOMException('Quota exceeded','QuotaExceededError');
    });
    const result=await saveModelEvaluationWithFallback(record,save);
    expect(result.mode).toBe('without-images');
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.record.archivedWithoutImages).toBe(true);
    expect(result.record.originalImageCount).toBe(1);
    expect(result.record.images).toEqual([]);
    expect(result.record.subjectImages).toEqual([]);
    expect(result.record.imageSignatures).toHaveLength(1);
    expect(result.record.subjectImageSignatures).toHaveLength(1);
    expect(result.record.results).toEqual(record.results);
    expect(result.record.rubricSnapshot).toEqual(record.rubricSnapshot);
    expect(result.record.question).toBe(record.question);
    expect(record.images[0]?.base64).toBe('long-copy-image');
  });

  it('never reports saving succeeded when both storage attempts fail, and exposes an actionable reason', async () => {
    const record=makeRecord('d1');
    const save=vi.fn(async (_value: ModelEvaluationRecord) => {
      throw new DOMException('Disk storage full','QuotaExceededError');
    });
    await expect(saveModelEvaluationWithFallback(record,save)).rejects.toMatchObject({name:'QuotaExceededError'});
    expect(save).toHaveBeenCalledTimes(2);
    expect(explainModelEvaluationStorageError(new DOMException('Disk storage full','QuotaExceededError')))
      .toContain('Espace de stockage');
  });

  it('does not compare experiments from different images after a compact archive', () => {
    const d1=makeRecord('d1');
    const tev=makeRecord('tev');
    const tevOtherCopy=makeRecord('tev-other','other-copy-image');
    const compact=compactModelEvaluationRecord(d1);
    expect(canCompareModelEvaluationRecords([compact,tev])).toBe(true);
    expect(canCompareModelEvaluationRecords([compact,compactModelEvaluationRecord(tev)])).toBe(true);
    expect(canCompareModelEvaluationRecords([compact,tevOtherCopy])).toBe(false);
    expect(canCompareModelEvaluationRecords([compact,compactModelEvaluationRecord(tevOtherCopy)])).toBe(false);
    expect(modelEvaluationImageSignature(d1.images[0]!)).not.toBe(modelEvaluationImageSignature(tevOtherCopy.images[0]!));
  });

  it('retains compatibility with older full-image history records', () => {
    const first=makeRecord('d1');
    const second=makeRecord('tev');
    expect(canCompareModelEvaluationRecords([first,second])).toBe(true);
    expect(canCompareModelEvaluationRecords([first,makeRecord('tev','other-copy-image')])).toBe(false);
  });
});
