import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
const correctionFlowStylesheet = readFileSync(new URL('../src/ui/correctionFlow.css', import.meta.url), 'utf8');
const modelSelectStylesheet = readFileSync(new URL('../src/ui/modelSelect.css', import.meta.url), 'utf8');
const designSystemControls = readFileSync(new URL('../src/ui/design-system/controls.css', import.meta.url), 'utf8');
const memoryStylesheet = readFileSync(new URL('../src/ui/localMemory.css', import.meta.url), 'utf8');
const memoryComponent = readFileSync(new URL('../src/ui/LocalMemoryCompanion.tsx', import.meta.url), 'utf8');
const mainEntry = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const appComponent = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
const observabilityComponent = readFileSync(new URL('../src/ui/ObservabilityDashboard.tsx', import.meta.url), 'utf8');
const observabilityStyles = readFileSync(new URL('../src/ui/observability.css', import.meta.url), 'utf8');
const dropdownComponent = readFileSync(new URL('../src/ui/components/DesignSystemSelect.tsx', import.meta.url), 'utf8');

describe('UI design system', () => {
  it('exposes progressive criterion results while analysis is still running and blocks incomplete finalization', () => {
    expect(appComponent).toContain('onCriterionUpdate');
    expect(appComponent).toContain('completedCriterionCount');
    expect(appComponent).toContain('criterion-live-progress');
    expect(appComponent).toContain('review.length !== rubric.criteria.length');
    expect(appComponent).toContain('Les propositions restent provisoires jusqu’à validation.');
    expect(correctionFlowStylesheet).toContain('.criterion-live-progress');
  });

  it('presents rubric import as separate reading and extraction steps with inspectable raw outputs', () => {
    expect(appComponent).toContain('aria-label="Étapes de l’import du barème"');
    expect(appComponent).toContain('1. Lecture du document');
    expect(appComponent).toContain('2. Extraction du barème');
    expect(appComponent).toContain('Voir le texte lu par le modèle de vision');
    expect(appComponent).toContain('Voir le JSON brut extrait');
    expect(appComponent).toContain('Afficher le journal détaillé de l’import');
    expect(appComponent).toContain('Arrêter l’import du barème');
    expect(appComponent).toContain('rubricImportAbortController.current?.abort()');
    expect(stylesheet).toContain('.rubric-import-steps');
    expect(stylesheet).toContain('.rubric-import-step.is-active');
    expect(stylesheet).toContain('.rubric-import-step.is-complete');
    expect(stylesheet).toContain('@media(max-width:520px)');
  });


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

  it('styles Ollama model selectors through the shared design-system control contract', () => {
    expect(mainEntry).toContain("import './ui/modelSelect.css';");
    expect(mainEntry).toContain("import './ui/design-system/tokens.css';");
    expect(mainEntry).toContain("import './ui/design-system/controls.css';");
    expect(appComponent).toContain('id="diagnostic-strategy"');
    expect(appComponent).toContain('value={diagnosticStrategy}');
    expect(modelSelectStylesheet).not.toContain('.ollama-panel select {');
    expect(modelSelectStylesheet).toContain('var(--ds-color-border)');
    expect(designSystemControls).toContain('select:not([multiple])');
    expect(designSystemControls).toContain('appearance: none;');
    expect(designSystemControls).toContain('min-height: 44px;');
    expect(designSystemControls).toContain('border-radius: var(--ds-radius-md)');
    expect(designSystemControls).toContain('box-shadow: var(--ds-shadow-control)');
    expect(designSystemControls).toContain('select.design-system-select:focus-visible');
    expect(designSystemControls).toContain('@media (max-width: 560px)');
    expect(designSystemControls).toContain('@media (prefers-reduced-motion: reduce)');
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

  it('keeps assignment management compact and reveals its actions on demand', () => {
    expect(appComponent).toContain('className="sidebar-assignment-current"');
    expect(appComponent).toContain('aria-expanded={showAssignmentPicker}');
    expect(appComponent).toContain('aria-controls="assignment-picker-options"');
    expect(appComponent).toContain('CHANGER DE DEVOIR');
    expect(appComponent).toContain('className="sidebar-assignment-actions"');
    expect(appComponent).not.toContain('htmlFor="assignment-title"');
    expect(correctionFlowStylesheet).toContain('.sidebar-assignment-current {');
    expect(correctionFlowStylesheet).toContain('.sidebar-assignment-menu {');
    expect(correctionFlowStylesheet).toContain('.sidebar-assignment-actions-menu {');
    expect(correctionFlowStylesheet).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('gives the observability workspace charts, trace details and responsive privacy-first styling', () => {
    expect(observabilityComponent).toContain('Durée des dernières exécutions');
    expect(observabilityComponent).toContain('Vision vs Analyse');
    expect(observabilityComponent).toContain('EXPLORATEUR DE TRACES');
    expect(observabilityComponent).toContain('sortie brute des modèles');
    expect(observabilityStyles).toContain('.observability-kpis');
    expect(appComponent).toContain('toModelEvaluationObservabilityTraces(savedModelEvaluations)');
    expect(appComponent).toContain('records={observabilityRecords}');
    expect(observabilityComponent).toContain("trace.source === 'model-evaluation'");
    expect(observabilityComponent).toContain('Historique des corrections et évaluations');
    expect(observabilityStyles).toContain('.observability-activity-chart');
    expect(observabilityStyles).toContain('@media (max-width: 700px)');
    expect(observabilityStyles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('routes every application dropdown through the shared design-system control', () => {
    expect(appComponent).not.toMatch(/<select\b/);
    expect(appComponent).toContain('<DesignSystemSelect id="assignment-education-level"');
    expect(appComponent).toContain('<DesignSystemSelect id="diagnostic-strategy"');
    expect(dropdownComponent).toContain("'design-system-select'");
    expect(stylesheet).toContain('.design-system-select {');
    expect(stylesheet).toContain('appearance: none;');
    expect(stylesheet).toContain('.design-system-select:focus-visible');
    expect(stylesheet).toContain('.design-system-select:disabled');
  });
  
  it('uses a shared wide workspace frame while preserving workflow-specific navigation', () => {
    expect(appComponent).toContain('evaluation-workspace-shell');
    expect(correctionFlowStylesheet).toContain('max-width: 1560px;');
    expect(correctionFlowStylesheet).toContain('grid-template-columns: minmax(240px, 264px) minmax(0, 1fr);');
    expect(correctionFlowStylesheet).toContain('.teacher-content-column {');
    expect(correctionFlowStylesheet).toContain('padding: 32px 0 0;');
    expect(stylesheet).toContain('.evaluation-workspace-shell {');
    expect(stylesheet).toContain('max-width: 1560px;');
    expect(stylesheet).toContain('.evaluation-workspace-shell .evaluation-page-header');
    expect(correctionFlowStylesheet).toContain('@media (max-width: 720px)');
    expect(stylesheet).toContain('@media (max-width: 720px)');
    expect(correctionFlowStylesheet).toContain('.teacher-step-nav');
    expect(stylesheet).toContain('.evaluation-step-nav');
  });

});