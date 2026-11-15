import type { Meta, StoryObj } from '@storybook/react';
import { createBackgroundCorrection } from '../../domain/backgroundCorrection.ts';
import { ActiveCopyProcessingWorkspace } from './ActiveCopyProcessingWorkspace.tsx';

const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="900" viewBox="0 0 640 900">
  <rect width="640" height="900" fill="#ffffff"/>
  <text x="65" y="68" font-size="16" fill="#274465">Copie fictive · Biologie cellulaire</text>
  <path d="M65 83H565" stroke="#cad6de"/>
  <text x="65" y="148" font-size="24" fill="#345478">Les phases de la mitose</text>
  <text x="65" y="213" font-size="16" fill="#345478">1. Prophase : condensation des chromosomes</text>
  <text x="65" y="256" font-size="16" fill="#345478">2. Métaphase : alignement au centre</text>
  <text x="65" y="299" font-size="16" fill="#345478">3. Anaphase : séparation des chromatides</text>
  <text x="65" y="342" font-size="16" fill="#345478">4. Télophase : formation des noyaux</text>
  <g stroke="#436d99" stroke-width="3" fill="none"><circle cx="145" cy="500" r="62"/><circle cx="320" cy="500" r="62"/><circle cx="495" cy="500" r="62"/>
  <path d="M115 470L175 530M175 470L115 530M300 457L345 542M345 457L300 542M475 480L510 520M510 480L475 520"/></g>
  <text x="65" y="680" font-size="15" fill="#345478">La mitose transmet une information génétique identique.</text>
  <path d="M65 726H565M65 765H565M65 805H515" stroke="#dce3e8"/>
</svg>`;
const exampleImage = {
  base64: btoa(sampleSvg),
  mimeType: 'image/svg+xml',
  fileName: 'copie-fictive.svg',
};

const draft = createBackgroundCorrection({
  id: 'storybook-mitose', assignmentId: 'bio', label: 'Copie fictive',
  question: 'Expliquer la mitose.',
  rubric: { title: 'Mitose', criteria: [
    { id: 'drawing', title: 'Qualité du dessin', description: '', maxPoints: 4 },
    { id: 'title', title: 'Titre', description: '', maxPoints: 2 },
    { id: 'labels', title: 'Légendes', description: '', maxPoints: 6 },
    { id: 'reasoning', title: 'Compréhension', description: '', maxPoints: 8 },
  ] },
  correctionMode: 'integrated',
  images: [exampleImage],
  originalImages: [exampleImage],
  subjectImages: [],
  detectTeacherAnnotations: false,
  annotationInkColor: 'none',
  annotationInkColorApplied: true,
  visionModel: 'vision', analysisModel: 'analysis',
  thinking: false,
  createdAt: '2026-11-05T08:00:00.000Z',
  updatedAt: '2026-11-05T08:00:00.000Z',
});

const meta = {
  title: 'Parcours enseignant/Correction en cours',
  component: ActiveCopyProcessingWorkspace,
  tags: ['autodocs'],
  decorators: [
    (Story) => <main className="teacher-flow-shell" style={{ width: '100%', maxWidth: 1160, margin: '0 auto', padding: '12px 20px', boxSizing: 'border-box' }}><Story /></main>,
  ],
} satisfies Meta<typeof ActiveCopyProcessingWorkspace>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Preparation: Story = {
  args: { job: { ...draft, status: 'processing', phase: 'preparation' }, studentLabel: 'Copie fictive' },
};
export const Lecture: Story = {
  args: { job: { ...draft, status: 'processing', phase: 'reading', completedPages: 0 }, studentLabel: 'Copie fictive' },
};
export const Correction: Story = {
  args: { job: {
    ...draft, status: 'processing', phase: 'grading', completedPages: 1, completedCriteria: 1,
    activeCriterionId: 'title',
    partialCriteria: [{
      criterionId: 'drawing', points: 4, confidence: 'high', evidence: 'Schéma bien construit', rationale: 'Conforme',
    }],
  }, studentLabel: 'Copie fictive' },
};
