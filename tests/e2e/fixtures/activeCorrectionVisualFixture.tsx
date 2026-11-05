import { createRoot } from 'react-dom/client';
import { createBackgroundCorrection } from '../../../src/domain/backgroundCorrection.ts';
import { ActiveCopyProcessingWorkspace } from '../../../src/ui/components/ActiveCopyProcessingWorkspace.tsx';

/**
 * Playwright-only fixture; Vite serves this TSX module to the test browser.
 * The real React component renders synthetic data, never an actual student copy.
 */
export function mountActiveCorrectionVisualFixture(): void {
  const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="750" height="980" viewBox="0 0 750 980">
    <rect width="750" height="980" fill="#fff"/>
    <text x="65" y="85" font-size="23" fill="#23435b" font-family="serif">Mitose : copie d'exemple</text>
    <path d="M65 102H680" stroke="#bccbd3"/>
    <text x="65" y="165" font-size="21" fill="#415b75" font-family="serif">Les phases de la mitose</text>
    <text x="65" y="214" font-size="15" fill="#415b75">Prophase : condensation des chromosomes</text>
    <text x="65" y="252" font-size="15" fill="#415b75">Metaphase : alignement au centre</text>
    <text x="65" y="290" font-size="15" fill="#415b75">Anaphase : separation des chromatides</text>
    <text x="65" y="328" font-size="15" fill="#415b75">Telophase : deux noyaux se forment</text>
    <g stroke="#456c97" fill="none" stroke-width="3"><circle cx="180" cy="530" r="75"/><circle cx="375" cy="530" r="75"/><circle cx="570" cy="530" r="75"/>
      <path d="M145 490L210 555M210 490L145 555M345 485L405 575M405 485L345 575M540 500L590 565M590 500L540 565"/></g>
    <text x="65" y="775" font-size="17" fill="#415b75">Resume : les cellules filles recoivent les chromosomes.</text>
    <path d="M65 830H680M65 865H680M65 900H630" stroke="#e1e7eb"/>
  </svg>`;
  const image = { base64: btoa(sampleSvg), mimeType: 'image/svg+xml', fileName: 'copie-exemple.svg' };
  const draft = createBackgroundCorrection({
    id: 'copy-visual-test', assignmentId: 'biology', label: 'Copie 1 - biologie cellulaire',
    question: 'Expliquer la mitose.',
    rubric: { title: 'Barème de mitose', criteria: [
      { id: 'drawing', title: 'Qualité du dessin', description: '', maxPoints: 4 },
      { id: 'title', title: 'Titre', description: '', maxPoints: 2 },
      { id: 'labels', title: 'Légendes', description: '', maxPoints: 6 },
      { id: 'reasoning', title: 'Compréhension', description: '', maxPoints: 8 },
    ] },
    correctionMode: 'integrated',
    images: [image], originalImages: [image], subjectImages: [],
    detectTeacherAnnotations: false, annotationInkColor: 'none', annotationInkColorApplied: true,
    visionModel: 'vision', analysisModel: 'analysis', thinking: false,
    createdAt: '2026-11-05T08:00:00.000Z', updatedAt: '2026-11-05T08:00:00.000Z',
  });
  const job = {
    ...draft, status: 'processing' as const, phase: 'grading' as const,
    completedPages: 1, completedCriteria: 1, totalCriteria: 4, activeCriterionId: 'title',
    partialCriteria: [
      { criterionId: 'drawing', points: 4, confidence: 'high' as const, evidence: 'Schéma représenté', rationale: '' },
    ],
  };

  const fixture = document.createElement('div');
  fixture.className = 'teacher-flow-shell atelier-processing-test-fixture';
  fixture.innerHTML = `
    <header class="topbar"><span class="brand-mark">CC</span><div><p class="eyebrow">ASSISTANT PÉDAGOGIQUE LOCAL</p><h1>Compagnon Correcteur de Devoirs</h1></div></header>
    <div class="teacher-content-column">
      <aside class="atelier-assignment-sidebar" aria-label="Navigation du devoir">
        <p class="atelier-sidebar-back">← Tous mes devoirs</p>
        <div class="atelier-sidebar-assignment"><strong>Partiel de biologie cellulaire</strong><small>Université · Licence 2 · 20 points</small></div>
        <div class="atelier-sidebar-section"><span class="eyebrow">MON DEVOIR</span><div class="atelier-sidebar-tabs"><button>Préparer le barème</button><button class="is-active">Suivre les copies</button></div></div>
      </aside>
      <main id="atelier-processing-fixture-root"></main>
    </div>
  `;
  document.body.appendChild(fixture);
  const container = fixture.querySelector<HTMLElement>('#atelier-processing-fixture-root');
  if (!container) throw new Error('Unable to mount the live processing fixture.');
  createRoot(container).render(<ActiveCopyProcessingWorkspace job={job} studentLabel="Copie 1 - biologie cellulaire" />);
}
