import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBackgroundCorrection } from '../../domain/backgroundCorrection.ts';
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
    expect(markup).toContain('aria-label="Pages originales de la copie en cours"');
    expect(markup).toContain('data:image/png;base64,cGFnZTE=');
    expect(markup).toContain('data:image/png;base64,cGFnZTI=');
    expect(markup).toContain('Camille Bernard');
    expect(markup).toContain('background-copy-activity');
    expect(markup).not.toContain('background-copy-progress');
    expect(markup).not.toContain('live-copy-preview');
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
