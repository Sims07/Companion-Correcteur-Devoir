import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CorrectionOverview } from './CorrectionOverview.tsx';
import { createBackgroundCorrection, toBackgroundJobSummary } from '../domain/backgroundCorrection.ts';
import type { BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';

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
const display = (current: BackgroundCorrectionJob) => renderToStaticMarkup(
  <CorrectionOverview
    jobs={[toBackgroundJobSummary(current)]} corrections={[]} currentCopy={null}
    filter="all" onFilterChange={vi.fn()} onAddCopy={vi.fn()} pendingCount={0}
    isStartingCorrections={false} onStartCorrections={vi.fn()}
    onOpenJob={vi.fn()} onRetryJob={vi.fn()}
    onOpenCorrection={vi.fn()} onOpenCurrentCopy={vi.fn()} onReviewNextCopy={vi.fn()}
  />,
);

describe('teacher correction overview and partial grade safety', () => {
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
