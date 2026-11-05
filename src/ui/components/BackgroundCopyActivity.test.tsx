import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBackgroundCorrection } from '../../domain/backgroundCorrection.ts';
import { BackgroundCopyActivity } from './BackgroundCopyActivity.tsx';

const job = createBackgroundCorrection({
  id: 'copy-1', assignmentId: 'bio-1', label: 'Copie 1',
  question: 'Décrire la mitose.',
  rubric: { title: 'Mitose', criteria: [
    { id: 'c1', title: 'Interphase', description: '', maxPoints: 2 },
    { id: 'c2', title: 'Métaphase', description: '', maxPoints: 2 },
  ] },
  correctionMode: 'integrated',
  images: [{ base64: 'cGFnZQ==', mimeType: 'image/png' }],
  originalImages: [{ base64: 'cGFnZQ==', mimeType: 'image/png' }],
  subjectImages: [], detectTeacherAnnotations: false,
  annotationInkColor: 'none', annotationInkColorApplied: true,
  visionModel: 'vision', analysisModel: 'analyse', thinking: false,
  createdAt: '2026-11-05T08:00:00.000Z',
  updatedAt: '2026-11-05T08:00:00.000Z',
});

const result = (criterionId: string, assessmentStatus?: 'not-evaluated') => ({
  criterionId, points: 1, confidence: 'high' as const, evidence: 'Preuve', rationale: '',
  ...(assessmentStatus ? { assessmentStatus } : {}),
});

describe('feedback visuel pendant la correction en arrière-plan', () => {
  it('montre le critère réellement commencé sans inventer une transcription', () => {
    const html = renderToStaticMarkup(<BackgroundCopyActivity job={{
      ...job, status: 'processing', phase: 'grading', activeCriterionId: 'c1',
    }} />);
    expect(html).toContain('Interphase');
    expect(html).toContain('En cours');
    expect(html).toContain('Métaphase');
    expect(html).toContain('À venir');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).not.toContain('La transcription apparaîtra');
    expect(html).not.toContain('Consulter le texte reconnu');
    expect(html).not.toContain('Note proposée');
  });

  it('actualise les critères traités et rend la transcription facultative seulement si elle existe', () => {
    const html = renderToStaticMarkup(<BackgroundCopyActivity job={{
      ...job, status: 'processing', phase: 'grading',
      activeCriterionId: 'c2', completedCriteria: 1,
      partialCriteria: [result('c1')], transcription: 'Texte de la copie',
    }} />);
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain('Analysé');
    expect(html).toContain('Consulter le texte reconnu');
    expect(html).toContain('Texte de la copie');
    expect(html).toContain('Métaphase');
    expect(html).toContain('En cours');
  });

  it('ne désigne aucun critère actif si le moteur ne le confirme pas', () => {
    const html = renderToStaticMarkup(<BackgroundCopyActivity job={{
      ...job, status: 'processing', phase: 'grading', activeCriterionId: null,
    }} />);
    expect(html).toContain('Analyse en cours. Le prochain résultat apparaîtra ici.');
    expect(html).not.toContain('aria-current="step"');
  });

  it('signale une évaluation impossible sans la présenter comme terminée', () => {
    const html = renderToStaticMarkup(<BackgroundCopyActivity job={{
      ...job, status: 'processing', phase: 'grading',
      completedCriteria: 1, partialCriteria: [result('c1', 'not-evaluated')],
    }} />);
    expect(html).toContain('À vérifier');
    expect(html).not.toContain('class="is-complete"');
  });
});
