import { describe, expect, it } from 'vitest';
import { canCompareModelEvaluationRecords, type ModelEvaluationRecord } from '../src/domain/modelEvaluation.ts';
import { modelEvaluationImageSignature } from '../src/domain/modelEvaluationImageIdentity.ts';

const record = (id: string, image = 'copy-A'): ModelEvaluationRecord => ({
  id, completedAt: '2026-11-05T18:00:00Z', assignmentId:'biology',
  assignmentTitle:'Biologie', question:'Biologie',
  rubricSnapshot:{ title:'Biologie',criteria:[{id:'q',title:'Photosynthèse',description:'',maxPoints:20}] },
  correctionMode:'integrated',
  images:[{mimeType:'image/jpeg',base64:image}],
  subjectImages:[{mimeType:'image/png',base64:'same-subject'}],
  subjectTranscription:'Sujet',
  configurations:[],
  results:[{profileId:id,profileName:id,elapsedMs:1000,readingMs:300,analysisMs:700,
    tokens:100,status:'success',transcription:'La lumière',raw:'{}',score:12,proposal:null}],
  stage:'integrated',
});

function compact(value: ModelEvaluationRecord): ModelEvaluationRecord {
  return {
    ...value,
    imageSignatures:value.images.map(modelEvaluationImageSignature),
    subjectImageSignatures:value.subjectImages.map(modelEvaluationImageSignature),
    originalImageCount:value.images.length,
    originalImagesArchived:false,
    images:[],subjectImages:[],
  };
}

describe('comparing lightweight model-evaluation archives', () => {
  it('permits comparing full and compact archives only for the same copy', () => {
    const d1=record('d1'), tev=record('tev'), other=record('other','different copy');
    expect(canCompareModelEvaluationRecords([d1,tev])).toBe(true);
    expect(canCompareModelEvaluationRecords([compact(d1),tev])).toBe(true);
    expect(canCompareModelEvaluationRecords([compact(d1),compact(tev)])).toBe(true);
    expect(canCompareModelEvaluationRecords([compact(d1),other])).toBe(false);
    expect(canCompareModelEvaluationRecords([compact(d1),compact(other)])).toBe(false);
  });

  it('refuses to compare old quota archives with no source-image identity', () => {
    const legacy={...record('old'),originalImagesArchived:false,images:[],subjectImages:[]};
    expect(canCompareModelEvaluationRecords([legacy,record('new')])).toBe(false);
    expect(canCompareModelEvaluationRecords([legacy,{...legacy,id:'another'}])).toBe(false);
  });

  it('keeps comparing the subject pages as well as copy pages', () => {
    const d1=compact(record('d1'));
    const differentSubject=record('tev');
    differentSubject.subjectImages[0]!.base64='different subject';
    expect(canCompareModelEvaluationRecords([d1,differentSubject])).toBe(false);
  });

  it('never hashes copy metadata in place of the actual image bytes', () => {
    const d1=record('d1');
    const other=record('tev');
    other.images[0]!.base64='copy-B';
    expect(modelEvaluationImageSignature(d1.images[0]!)).not.toBe(modelEvaluationImageSignature(other.images[0]!));
  });
});
