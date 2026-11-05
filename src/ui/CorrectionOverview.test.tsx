import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CorrectionOverview } from './CorrectionOverview.tsx';
import { createBackgroundCorrection, toBackgroundJobSummary } from '../domain/backgroundCorrection.ts';
import type { BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';
import type { LocalCorrection } from '../domain/localCorrection.ts';

const job = createBackgroundCorrection({
  id: 'copy-1', assignmentId: 'assignment-1', label: 'Copie de biologie',
  question: 'Décrire la mitose.',
  rubric: { title: 'Mitose', criteria: [
    { id: 'text', title: 'Rédaction', description: '', maxPoints: 2 },
    { id: 'visual', title: 'Schéma', description: '', maxPoints: 2 },
  ] },
  correctionMode: 'integrated',
  images: [{ base64: 'cGFnZQ==', mimeType: 'image/png' }],
  originalImages: [{ base64: 'cGFnZQ==', mimeType: 'image/png' }],
  subjectImages: [], detectTeacherAnnotations: false,
  annotationInkColor: 'none', annotationInkColorApplied: true,
  visionModel: 'vision', analysisModel: 'analysis', thinking: false,
  createdAt: '2026-11-01T09:00:00.000Z', updatedAt: '2026-11-01T09:00:00.000Z',
});
const criterion = (id: string, points: number) => ({
  criterionId: id, points, confidence: 'high' as const,
  evidence: 'Réponse observée', rationale: '',
});
const display = (current: BackgroundCorrectionJob, isStartingCorrections = false) => renderToStaticMarkup(
  <CorrectionOverview
    jobs={[toBackgroundJobSummary(current)]} corrections={[]} currentCopy={null}
    filter="all" onFilterChange={vi.fn()} onAddCopy={vi.fn()} addCopyExpanded={false} pendingCount={1}
    isStartingCorrections={isStartingCorrections} isStoppingCorrections={false} onStopCorrections={vi.fn()} onStartCorrections={vi.fn()}
    onOpenJob={vi.fn()} onRetryJob={vi.fn()} onRemoveJob={vi.fn()} notice=""
    onOpenCorrection={vi.fn()} onOpenCurrentCopy={vi.fn()} onReviewNextCopy={vi.fn()}
  />,
);


const archivedCorrection: LocalCorrection = {
  id: 'archived-1',
  label: 'Copie de démonstration',
  rubricTitle: 'Mitose',
  rubricFingerprint: 'fixture',
  createdAt: '2026-11-05T09:00:00.000Z',
  updatedAt: '2026-11-05T10:00:00.000Z',
  snapshot: {
    assignmentTitle: 'Mitose',
    question: job.question,
    rubric: job.rubric,
    proposal: {
      summary: 'Correction complète',
      criteria: [criterion('text', 2), criterion('visual', 1.5)],
      questionsForTeacher: [],
      finalScore: 3.5,
    },
    review: [
      { ...criterion('text', 2), teacherPoints: 2, teacherComment: '', decision: 'accepted' },
      { ...criterion('visual', 1.5), teacherPoints: 1.5, teacherComment: '', decision: 'accepted' },
    ],
    teacherQuestions: '',
    images: job.images,
    transcription: null,
    subjectImages: [],
    subjectTranscription: null,
    correctionMode: 'integrated',
    maximumPoints: 4,
  },
};

const displayArchived = () => renderToStaticMarkup(
  <CorrectionOverview
    jobs={[]} corrections={[archivedCorrection]} currentCopy={null}
    filter="completed" onFilterChange={vi.fn()} onAddCopy={vi.fn()} addCopyExpanded={false} pendingCount={0}
    isStartingCorrections={false} isStoppingCorrections={false} onStopCorrections={vi.fn()} onStartCorrections={vi.fn()}
    onOpenJob={vi.fn()} onRetryJob={vi.fn()} onRemoveJob={vi.fn()} notice=""
    onOpenCorrection={vi.fn()} onOpenCurrentCopy={vi.fn()} onReviewNextCopy={vi.fn()}
  />,
);

describe('teacher correction overview and partial grade safety', () => {
  it('separates the completed status and the save date while keeping the final grade and consultation action clear', () => {
    const html = displayArchived();
    expect(html).toContain('Copie de démonstration');
    expect(html).toContain('1 page</small>');
    expect(html).toContain('Note finale');
    expect(html).toContain('3,5');
    expect(html).toContain('class="correction-series-card-meta"');
    expect(html).toContain('class="correction-series-card-status is-completed">Corrigée</span><time');
    expect(html).toContain('class="correction-series-card-date"');
    expect(html).toContain('Enregistrée le 05/11/2026');
    expect(html).toContain('Consulter la correction <span aria-hidden="true">→</span>');
    expect(html).not.toContain('CorrigéeEnregistrée');
  });

  it('names the first queued copy while the model is starting and exposes its preview', () => {
    const html = display(job, true);
    expect(html).toContain('Préparation : Copie de biologie');
    expect(html).toContain('Le modèle IA se prépare.');
    expect(html).toContain('Préparation en cours…');
    expect(html).toContain('Voir la copie');
    expect(html).toContain('Note à venir');
    expect(html).not.toContain('0<span> / 4</span>');
  });

  it('labels page-reading and criterion progress with explicit units', () => {
    expect(display({ ...job, status: 'processing', phase: 'preparation' })).toContain('Préparation de la copie et du modèle IA');
    expect(display({ ...job, status: 'processing', phase: 'reading', completedPages: 1 })).toContain('1/1 pages lues');
    expect(display({ ...job, status: 'processing', phase: 'grading', completedCriteria: 1 })).toContain('1/2 critères évalués');
  });


  it('keeps stopping contextual to the copy currently being prepared or corrected', () => {
    expect(display({ ...job, status: 'processing' })).toContain('Arrêter');
    expect(display(job, true)).toContain('Arrêter');
    expect(display(job)).not.toContain('context-stop-button');
    expect(display({ ...job, status: 'ready' })).not.toContain('context-stop-button');
  });

  it('offers removal for a waiting copy, without showing it during processing or after archiving', () => {
    expect(display(job)).toContain('Retirer la copie « Copie de biologie »');
    expect(display({ ...job, status: 'ready' })).toContain('Retirer la copie « Copie de biologie »');
    expect(display({ ...job, status: 'failed' })).toContain('Retirer la copie « Copie de biologie »');
    expect(display({ ...job, status: 'processing' })).not.toContain('Retirer la copie');
    expect(display({ ...job, status: 'completed' })).not.toContain('Retirer la copie');
  });

  it('marks an explicitly interrupted copy and offers resuming rather than an invalid grade', () => {
    const html = display({ ...job, status: 'pending', error: 'Correction interrompue par l’enseignant. Vous pouvez la reprendre.' });
    expect(html).toContain('En attente · interrompue');
    expect(html).toContain('Reprendre les corrections');
    expect(html).toContain('Interrompue à votre demande');
    expect(html).toContain('Note à venir');
  });

  it('offers an explicit retry and no invented grade when the LLM fails after a partial result', () => {
    const html = display({
      ...job,
      status: 'failed',
      phase: 'grading',
      error: 'Erreur HTTP 500',
      partialCriteria: [criterion('text', 2)],
      completedCriteria: 1,
      proposal: { summary: '', criteria: [criterion('text', 2)], finalScore: 2, scoreIncomplete: true, questionsForTeacher: [] },
    });
    expect(html).toContain('À reprendre');
    expect(html).toContain('Relancer');
    expect(html).toContain('Vous pouvez relancer sa correction');
    expect(html).toContain('Note à venir');
    expect(html).not.toContain('Erreur HTTP 500');
    expect(html).not.toContain('2<span> / 4</span>');
  });

  it('shows a pending grade rather than a misleading partial numeric result after interrupted evaluation', () => {
    const html = display({
      ...job, status: 'needs-review',
      partialCriteria: [criterion('text', 2)],
      completedCriteria: 1,
      proposal: {
        summary: 'Partielle', criteria: [criterion('text', 2)],
        finalScore: 2, scoreIncomplete: true, questionsForTeacher: [],
      },
    });
    expect(html).toContain('Copie de biologie');
    expect(html).toContain('Note à venir');
    expect(html).toContain('Des éléments restent à vérifier');
    expect(html).not.toContain('Note proposée');
    expect(html).not.toContain('2<span> / 4</span>');
  });

  it('shows a valid proposed score only after every rubric criterion has been assessed', () => {
    const html = display({
      ...job, status: 'ready', completedCriteria: 2,
      proposal: {
        summary: 'Complète', criteria: [criterion('text', 2), criterion('visual', 1.5)],
        finalScore: 3.5, questionsForTeacher: [],
      },
    });
    expect(html).toContain('Note proposée');
    expect(html).toContain('3,5');
    expect(html).toContain('4');
  });
});
