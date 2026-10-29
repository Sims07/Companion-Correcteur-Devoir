import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
const correctionFlowStylesheet = readFileSync(new URL('../src/ui/correctionFlow.css', import.meta.url), 'utf8');
const modelSelectStylesheet = readFileSync(new URL('../src/ui/modelSelect.css', import.meta.url), 'utf8');
const memoryStylesheet = readFileSync(new URL('../src/ui/localMemory.css', import.meta.url), 'utf8');
const dropdownComponent = readFileSync(new URL('../src/ui/components/DesignSystemSelect.tsx', import.meta.url), 'utf8');
const memoryComponent = readFileSync(new URL('../src/ui/LocalMemoryCompanion.tsx', import.meta.url), 'utf8');
const mainEntry = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const appComponent = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');

describe('UI design system', () => {
  it('does not present a location hint as a handwritten comment', () => {
    expect(appComponent).toContain('{item.annotationSuggestion && <section className="annotation-suggestion"');
    expect(appComponent).not.toContain('{(item.annotationSuggestion || item.locationHint) && <section className="annotation-suggestion"');
  });

  it('defines a shared spacing scale and reusable surface tokens', () => {
    expect(stylesheet).toContain('--space-1: 4px');
    expect(stylesheet).toContain('--space-8: 32px');
    expect(stylesheet).toContain('--surface-subtle: #f8faf7');
    expect(stylesheet).toContain('--text-secondary: #647467');
  });

  it('provides visible keyboard focus states for interactive controls', () => {
    expect(stylesheet).toContain('button:focus-visible');
    expect(stylesheet).toContain('input:focus-visible');
    expect(stylesheet).toContain('textarea:focus-visible');
    expect(stylesheet).toContain('outline: 3px solid');
  });

  it('adapts the layout for narrow mobile viewports', () => {
    expect(stylesheet).toContain('@media (max-width: 560px)');
    expect(stylesheet).toContain('@media (max-width: 380px)');
    expect(stylesheet).toContain('.view-switch-button { flex: 1;');
  });

  it('respects reduced-motion preferences', () => {
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesheet).toContain('animation-duration: .01ms');
  });

  it('gives the correction workflow an explicit visual hierarchy and breathing room', () => {
    expect(correctionFlowStylesheet).toContain('.workspace-heading .eyebrow');
    expect(correctionFlowStylesheet).toContain('.correction-mode-panel,\n.subject-panel {\n  margin-bottom: var(--flow-space-4);');
    expect(correctionFlowStylesheet).toContain('.correction-mode-options {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: var(--flow-space-4);');
    expect(correctionFlowStylesheet).toContain('.setup-grid {\n  gap: var(--flow-space-5);');
    expect(correctionFlowStylesheet).toContain('.question-panel {\n  margin-top: var(--flow-space-5);');
  });

  it('creates a persistent teacher sidebar and responsive single-task workspace', () => {
    expect(correctionFlowStylesheet).toContain('.teacher-flow-shell {');
    expect(correctionFlowStylesheet).toContain('grid-template-columns: 258px minmax(0, 1fr);');
    expect(correctionFlowStylesheet).toContain('.teacher-sidebar {');
    expect(correctionFlowStylesheet).toContain('.sidebar-ai-setup {');
    expect(correctionFlowStylesheet).toContain('.sidebar-local-status.is-processing');
    expect(correctionFlowStylesheet).toContain('.sidebar-local-status.is-processing > span:first-child { animation: none; }');
    expect(correctionFlowStylesheet).toContain('.teacher-step.active');
    expect(correctionFlowStylesheet).toContain('.teacher-model-panel');
    expect(correctionFlowStylesheet).toContain('.sidebar-archive-button');
    expect(correctionFlowStylesheet).toContain('.correction-archive');
    expect(correctionFlowStylesheet).toContain('.archive-card');
    expect(correctionFlowStylesheet).toContain('.finalized-next-actions');
    expect(correctionFlowStylesheet).toContain('.student-label-field');
    expect(correctionFlowStylesheet).toContain('.ai-settings-view');
    expect(correctionFlowStylesheet).toContain('.teacher-flow-shell .setup-needed');
    expect(correctionFlowStylesheet).toContain('.teacher-flow-shell .setup-complete');
    expect(correctionFlowStylesheet).toContain('.processing-workspace-heading');
    expect(correctionFlowStylesheet).toContain('.teacher-flow-shell .analysis-progress');
    expect(correctionFlowStylesheet).toContain('.teacher-flow-shell .privacy-strip,');
    expect(correctionFlowStylesheet).toContain('@media (max-width: 720px)');
    expect(correctionFlowStylesheet).toContain('.teacher-step-nav { grid-template-columns: repeat(3, minmax(0, 1fr));');
  });

  it('turns correction-mode radios into distinct selectable cards', () => {
    expect(correctionFlowStylesheet).toContain('.correction-mode-option {');
    expect(correctionFlowStylesheet).toContain('.correction-mode-option.selected {');
    expect(correctionFlowStylesheet).toContain('.correction-mode-option input[type="radio"] {');
    expect(correctionFlowStylesheet).toContain('.correction-mode-option small {');
  });

  it('keeps the correction flow readable on mobile and with reduced motion', () => {
    expect(correctionFlowStylesheet).toContain('@media (max-width: 760px)');
    expect(correctionFlowStylesheet).toContain('@media (max-width: 430px)');
    expect(correctionFlowStylesheet).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('gives correction rules a clear hierarchy instead of a compact catch-all panel', () => {
    expect(memoryStylesheet).toContain('.memory-panel{position:fixed');
    expect(memoryStylesheet).toContain('width:min(560px');
    expect(memoryStylesheet).toContain('.memory-correction-select{height:48px');
    expect(memoryStylesheet).toContain('.memory-section{border-top:1px solid');
    expect(memoryStylesheet).toContain('.memory-step{display:grid');
    expect(memoryStylesheet).toContain('@media(max-width:600px)');
    expect(memoryComponent).toContain('Correction active');
    expect(memoryComponent).toContain('Barème utilisé');
    expect(memoryComponent).toContain('Décision à conserver');
    expect(memoryComponent).toContain('Réutiliser cette décision avec le barème');
    expect(memoryComponent).toContain('+ Nouvelle correction');
  });

  it('routes every application dropdown through the shared design-system control', () => {
    expect(appComponent).not.toMatch(/<select\\b/);
    expect(appComponent).toContain('<DesignSystemSelect id="assignment-education-level"');
    expect(appComponent).toContain('<DesignSystemSelect id="diagnostic-strategy"');
    expect(dropdownComponent).toContain("'design-system-select'");
    expect(stylesheet).toContain('.design-system-select {');
    expect(stylesheet).toContain('appearance: none;');
    expect(stylesheet).toContain('.design-system-select:focus-visible');
    expect(stylesheet).toContain('.design-system-select:disabled');
  });

  it('styles Ollama model selectors as a reusable, accessible design-system control', () => {
    expect(mainEntry).toContain("import './ui/modelSelect.css';");
    expect(modelSelectStylesheet).toContain('.ollama-panel select {');
    expect(appComponent).toContain('id="diagnostic-strategy"');
    expect(appComponent).toContain('value={diagnosticStrategy}');
    expect(modelSelectStylesheet).toContain('appearance: none;');
    expect(modelSelectStylesheet).toContain('min-height: 48px;');
    expect(modelSelectStylesheet).toContain('border-radius: 12px;');
    expect(modelSelectStylesheet).toContain('box-shadow: 0 1px 2px');
    expect(modelSelectStylesheet).toContain('.ollama-panel select:focus-visible');
    expect(modelSelectStylesheet).toContain('@media (max-width: 430px)');
    expect(modelSelectStylesheet).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('renders a live transcription preview while reading and a visual rubric analysis while grading', () => {
    expect(appComponent).toContain('className="live-copy-preview panel"');
    expect(appComponent).toContain('className="live-copy-layout"');
    expect(appComponent).toContain('Page ${index + 1} de la copie en cours de lecture');
    expect(appComponent).toContain('className="live-transcription-panel"');
    expect(appComponent).toContain('className="live-analysis-preview panel"');
    expect(appComponent).toContain('className="live-analysis-criteria"');
    expect(correctionFlowStylesheet).toContain('.live-copy-page img');
    expect(correctionFlowStylesheet).toContain('.live-transcription-text');
    expect(correctionFlowStylesheet).toContain('.live-analysis-criteria');
    expect(correctionFlowStylesheet).toContain('@media(prefers-reduced-motion:reduce)');
  });
  it('provides an explicit local copy queue for serial grading', () => {
    expect(appComponent).toContain('function queueCurrentCopy()');
    expect(appComponent).toContain('function loadNextQueuedCopy()');
    expect(appComponent).toContain('Mettre cette copie en file d’attente');
    expect(appComponent).toContain('File des copies à corriger');
    expect(appComponent).toContain('À traiter');
    expect(appComponent).toContain('copyQueue: QueuedCopy[]');
    expect(correctionFlowStylesheet).toContain('.copy-queue');
    expect(correctionFlowStylesheet).toContain('.queue-position');
  });

  it('prioritizes actionable review alerts and keeps original copy evidence available during grading', () => {
    expect(appComponent).toContain('review-alerts');
    expect(appComponent).toContain('getReviewInsights(review)');
    expect(appComponent).toContain('Afficher les ${reviewInsights.flaggedCriteriaIds.length} critères à vérifier');
    expect(appComponent).toContain('className="review-workspace"');
    expect(appComponent).toContain('className="review-source-pane"');
    expect(appComponent).toContain('Copie de référence');
    expect(appComponent).toContain('className="review-transcription"');
    expect(appComponent).not.toContain('showSourceEvidence');
    expect(appComponent).toContain('La transcription est absente');
    expect(appComponent).toContain('correction-batch-progress');
    expect(appComponent).toContain('Ajouter une autre copie');
    expect(appComponent).toContain('Chaque copie enregistrée reste disponible dans « Corrections enregistrées ».');
    expect(correctionFlowStylesheet).toContain('.review-alerts');
    expect(correctionFlowStylesheet).toContain('.review-workspace { display: grid;');
    expect(correctionFlowStylesheet).toContain('.review-source-pane { position: sticky;');
    expect(correctionFlowStylesheet).toContain('.review-score-summary { position: sticky;');
    expect(correctionFlowStylesheet).toContain('@media (max-width: 720px)');
    expect(correctionFlowStylesheet).toContain('.correction-batch-progress');
  });

  it('makes multiple local assignments discoverable and gives each assignment its own saved rubric and question', () => {
    expect(appComponent).toContain('assignmentProfilesKey');
    expect(appComponent).toContain('function createNewAssignment()');
    expect(appComponent).toContain('function switchAssignment(profile: AssignmentProfile)');
    expect(appComponent).toContain('aria-label="Mes devoirs"');
    expect(appComponent).toContain('className="sidebar-new-assignment"');
    expect(appComponent).toContain('setRubric(profile.rubric)');
    expect(appComponent).toContain('setQuestion(profile.question)');
    expect(correctionFlowStylesheet).toContain('.sidebar-assignment-item.active');
    expect(correctionFlowStylesheet).toContain('.sidebar-new-assignment');
    expect(correctionFlowStylesheet).toContain('@media (max-width: 720px)');
  });
});
