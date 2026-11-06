import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBackgroundCorrection, toBackgroundJobOverview } from '../../domain/backgroundCorrection.ts';
import { ActiveCopyProcessingWorkspace } from './ActiveCopyProcessingWorkspace.tsx';

const job = createBackgroundCorrection({
  id: 'copy-b', assignmentId: 'biology', label: 'Copie en cours',
  question: 'Décrire les phases de la mitose.',
  rubric: {
    title: 'Mitose',
    criteria: [
      { id: 'diagram', title: 'Qualité du dessin', description: '', maxPoints: 4 },
      { id: 'legend', title: 'Légendes', description: '', maxPoints: 3 },
      { id: 'concepts', title: 'Compréhension', description: '', maxPoints: 3 },
    ],
  },
  correctionMode: 'integrated',
  images: [
    { base64: 'cGFnZTE=', mimeType: 'image/png', fileName: 'page-1.png' },
    { base64: 'cGFnZTI=', mimeType: 'image/png', fileName: 'page-2.png' },
  ],
  originalImages: [],
  subjectImages: [],
  detectTeacherAnnotations: false,
  annotationInkColor: 'none',
  annotationInkColorApplied: true,
  visionModel: 'vision', analysisModel: 'analysis', thinking: false,
  createdAt: '2026-11-05T08:00:00.000Z',
  updatedAt: '2026-11-05T08:00:00.000Z',
});

describe('Atelier B: correction en cours centrée sur la copie', () => {
  it('places full copy pages beside live criterion statuses in one workspace', () => {
    const markup = renderToStaticMarkup(
      <ActiveCopyProcessingWorkspace job={{ ...job, status: 'processing', phase: 'reading', completedPages: 1 }} studentLabel="Camille Bernard" />,
    );
    expect(markup).toContain('atelier-processing-columns');
    expect(markup).toContain('Copie de l&#x27;étudiant');
    expect(markup).toContain('aria-label="Pages de la copie en cours"');
    expect(markup).toContain('data:image/png;base64,cGFnZTE=');
    expect(markup).toContain('data:image/png;base64,cGFnZTI=');
    expect(markup).toContain('Camille Bernard');
    expect(markup).toContain('background-copy-activity');
    expect(markup).not.toContain('background-copy-progress');
    expect(markup).not.toContain('live-copy-preview');
  });


  it('renders selected full pages instead of empty queue placeholders after the memory optimization', () => {
    const overview = toBackgroundJobOverview({ ...job, status: 'processing', phase: 'reading' });
    expect(overview.images[0].base64).toBe('');
    const markup = renderToStaticMarkup(<ActiveCopyProcessingWorkspace job={overview} pages={job.images} />);
    expect(markup).toContain('data:image/png;base64,cGFnZTE=');
    expect(markup).toContain('data:image/png;base64,cGFnZTI=');
    expect(markup).not.toContain('Chargement de la page');

    // A pending asynchronous page load must never produce a broken data URL.
    const loading = renderToStaticMarkup(<ActiveCopyProcessingWorkspace job={overview} />);
    expect(loading).toContain('Chargement de la page 1');
    expect(loading).not.toContain('<img');
    expect(loading).not.toContain('data:image/png;base64,');
  });

  it('marks exactly the current processing stage without inventing grades', () => {
    for (const phase of ['preparation', 'reading', 'grading'] as const) {
      const markup = renderToStaticMarkup(<ActiveCopyProcessingWorkspace job={{ ...job, status: 'processing', phase }} />);
      expect((markup.match(/aria-current="step"/g) ?? [])).toHaveLength(1);
      expect(markup).toContain('aria-label="Progression de la correction"');
      expect(markup).toContain('Critères du barème');
      expect(markup).not.toContain('Note proposée');
    }
  });

  it('shows a contextual stop action only for interruptible running work', () => {
    const markup = renderToStaticMarkup(<ActiveCopyProcessingWorkspace job={{ ...job, status: 'processing' }} onStopCorrections={() => undefined} />);
    expect(markup).toContain('Arrêter cette correction');
    expect(markup).toContain('context-stop-button');
    const stopping = renderToStaticMarkup(<ActiveCopyProcessingWorkspace job={{ ...job, status: 'processing' }} onStopCorrections={() => undefined} isStoppingCorrections />);
    expect(stopping).toContain('disabled=""');
    expect(stopping).toContain('Arrêt en cours');
    expect(renderToStaticMarkup(<ActiveCopyProcessingWorkspace job={job} />)).not.toContain('context-stop-button');
  });

  it('reports recorded counts and keeps transcription optional', () => {
    const markup = renderToStaticMarkup(
      <ActiveCopyProcessingWorkspace job={{
        ...job,
        status: 'processing', phase: 'grading', completedPages: 2, completedCriteria: 1,
        partialCriteria: [{ criterionId: 'diagram', points: 2, confidence: 'high', evidence: 'Schéma', rationale: '' }],
        transcription: 'Description de mitose',
        activeCriterionId: 'legend',
      }} />,
    );
    expect(markup).toContain('2 / 2 pages lues');
    expect(markup).toContain('1 / 3 critères traités');
    expect(markup).toContain('aria-valuenow="1"');
    expect(markup).toContain('Consulter le texte reconnu');
    expect(markup).toContain('aria-current="step"');
  });
});
