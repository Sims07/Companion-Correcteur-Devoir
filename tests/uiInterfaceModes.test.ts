import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('teacher and AI diagnostic interface modes', () => {
  const app = () => source('../src/ui/App.tsx');

  it('shows optional teacher-facing annotation suggestions linked to the source page', () => {
    const text = app();
    expect(text).toContain('COMMENTAIRE ÉVENTUEL À REPORTER AU STYLO');
    expect(text).toContain('Suggestion IA');
    expect(text).toContain('Repère indicatif');
    expect(text).toContain('Afficher la page liée');
    expect(text).toContain('item.annotationSuggestion');
    expect(text).toContain('item.locationHint');
  });

  it('keeps the normal correction view concise and exposes explanations only on demand', () => {
    const text = app();
    expect(text).toContain('Voir la preuve et la justification');
    expect(text).toContain('review-explanation');
    expect(text).toContain('Confirmer les critères sans alerte ({pendingReliableCriterionIds.length})');
    expect(text).toContain('disabled={!criterionProgress.isComplete || isAnalyzing}');
    expect(text).toContain('undoGroupConfirmation');
    expect(text).toContain('Aucun signal automatique. La vérification humaine reste nécessaire.');
    expect(text).toContain('Les points retirés et les incertitudes restent à examiner.');
    expect(text).toContain('Afficher tous les critères');
    expect(text).toContain('Voir les {reliableCriteriaCount} critères sans alerte');
    expect(text).toContain('Voir la synthèse de l’analyse');
    expect(text).toContain('Synthèse des éléments à examiner');
    expect(text).not.toContain('Vérifications prioritaires');
    expect(text).not.toContain('reviewInsights.flaggedCriteriaIds.length');
    expect(text).not.toContain('<p>{proposal?.summary ??');
  });

  it('keeps a local archive and next-copy path after finalization', () => {
    const text = app();
    expect(text).toContain("useState<'details' | 'rubric' | 'copy' | 'progress' | 'review' | 'archive'>('rubric')");
    expect(text).toContain('Corrections enregistrées');
    expect(text).toContain('Ajouter une autre copie');
    expect(text).toContain('Consulter la correction');
    expect(text).toContain('archiveService.saveCorrection(correction)');
    expect(text).toContain("images: evaluationStageMode === 'analysis' ? [] : structuredClone(images)");
    expect(text).toContain('snapshot.review');
    expect(text).toContain('stocké dans ce navigateur');
  });


  it('keeps one clear primary action to save a reviewed correction', () => {
    const text = app();
    expect(text).toContain("item.decision === 'pending' ? 'accepted' : 'pending'");
    expect(text).toContain('Confirmer ce critère');
    expect(text).toContain('✓ Critère confirmé');
    expect(text).toContain('Enregistrer la correction');
    expect(text).toContain('Enregistrer les modifications');
    expect(text).toContain('Exporter le récapitulatif (JSON)');
    expect(text).not.toContain('function decideAll()');
    expect(text).not.toContain('Accepter les propositions non modifiées');
    expect(text).not.toContain('Finaliser la correction');
    expect(text).not.toContain('Correction finalisée localement');
    expect(text).toContain('Chaque copie enregistrée reste disponible dans « Corrections enregistrées ».');
    expect(text).toContain('setIsFinalized(false)');
  });

  it('keeps teacher annotations local to the teacher view and resets them between copies', () => {
    const text = app();
    expect(text).toContain('teacherAnnotations,');
    expect(text).toContain('teacherAnnotations:');
    expect(text).toContain('setTeacherAnnotations(snapshot.teacherAnnotations ?? \'\')');
    expect(text).toContain('setTeacherAnnotations(draft?.teacherAnnotations ?? \'\')');
    expect(text).toContain('setTeacherAnnotations(\'\');');
    expect(text).not.toContain('teacherAnnotations,\\n                rubric: diagramRubric');
  });

  it('requires teacher approval for rotation suggestions and verifies enabled automatic rotations', () => {
    const text = app();
    expect(text).toContain('La page {index + 1} semble tournée de {rotationSuggestions[index].degrees}°');
    expect(text).toContain('>Appliquer</button>');
    expect(text).toContain('>Ignorer</button>');
    expect(text).toContain("getItem('companion-correcteur:auto-rotate-diagrams:v1') === 'true'");
    expect(text).toContain("verification.suggestedRotation === 0");
    expect(text).toContain('manualRotationAngles');
    expect(text).toContain('accumulateClockwiseRotation');
  });

  it('defaults to the teacher correction view', () => {
    expect(app()).toContain("useState<'teacher' | 'diagnostic' | 'debug' | 'observability'>('teacher')");
    expect(app()).toContain("interfaceMode === 'teacher' ? 'view-switch-button active' : 'view-switch-button'");
  });

  it('exposes an independent local observability workspace with privacy-safe trace exploration', () => {
    const text = app();
    expect(text).toContain('>Observabilité</button>');
    expect(text).toContain("aria-pressed={interfaceMode === 'observability'}");
    expect(text).toContain('<ObservabilityDashboard records={observabilityRecords} />');
    expect(text).toContain('const timingHistoryLimit = 100;');
  });

  it('offers a sequential independent evaluation for saved model configurations', () => {
    const text = app();
    expect(text).toContain('Choisir les configurations à évaluer');
    expect(text).toContain('Configurations à exécuter');
    expect(text).toContain('Une seule suffit pour mesurer ses performances');
    expect(text).toContain('selectedProfiles.length < 1');
    expect(text).toContain('selectedEvaluationProfileIds.length < 1');
    expect(text).toContain('Comparer les modèles Vision');
    expect(text).toContain('Comparer les modèles d’analyse');
    expect(text).toContain('Évaluer cette configuration');
    expect(text).toContain('Annuler après l’appel en cours');
    expect(text).toContain('runModelEvaluation({');
    expect(text).toContain('images: structuredClone(images)');
    expect(text).toContain("evaluationStageMode === 'analysis' ? { transcription: transcription ?? '' } : {}");
    expect(text).toContain("evaluationStageMode === 'vision' ? { visionOnly: true } : {}");
    expect(text).toContain('Vision seule');
    expect(text).toContain('Analyse seule');
    expect(text).toContain('Transcription à noter');
    expect(text).toContain('Transcription produite');
    expect(text).toContain('Résultats de lecture par modèle');
    expect(text).toContain('Résultats de notation par modèle');
    expect(text).toContain('Résultats des deux étapes par configuration');
    expect(text).toContain('configuration.endpoint');
    expect(text).toContain('evaluationService.save(savedRecord)');
    expect(text).toContain('Historique & comparaison graphique');
    expect(text).toContain('Consulter / recharger la référence');
    expect(text).toContain('IndexedDB sur cet appareil');
    expect(text).toContain('Réponse du modèle en streaming');
    expect(text).toContain('Lecture des images');
    expect(text).toContain('Analyse et notation');
    expect(text).toContain('Analyse comparative des configurations');
    expect(text).toContain('Sans note de référence validée par l’enseignant');
  });

  it('presents saved model configurations as responsive, accessible design-system cards', () => {
    const text = app();
    const styles = source('../src/ui/styles.css');
    expect(text).toContain('className="evaluation-profile-options"');
    expect(text).toContain("className={`evaluation-profile-option ${selected ? 'is-selected' : ''} ${disabled && !selected ? 'is-disabled' : ''}`}");
    expect(text).toContain('className="evaluation-profile-models"');
    expect(text).toContain('aria-live="polite" className={selectedEvaluationProfileIds.length >= 1 ?');
    expect(text).toContain('aria-describedby="evaluation-profile-selection-help"');
    expect(text).toContain('className="evaluation-profile-selection-mark" aria-hidden="true"');
    expect(styles).toContain('.evaluation-profile-option.is-selected');
    expect(styles).toContain('.evaluation-profile-option:focus-within');
    expect(styles).toContain('.evaluation-profile-option.is-disabled');
    expect(styles).toContain('@media (max-width: 640px)');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('shows which saved configuration is active and which phase a long evaluation is running', () => {
    const text = app();
    const styles = source('../src/ui/styles.css');
    expect(text).toContain('SUIVI DE L’EXPÉRIENCE');
    expect(text).toContain('evaluation-configuration-steps');
    expect(text).toContain('En cours maintenant');
    expect(text).toContain('En attente');
    expect(text).toContain('evaluationProgress.currentConfiguration?.id === profile.id');
    expect(text).toContain('aria-valuenow={evaluationProgress.completedSteps}');
    expect(text).toContain('aria-valuemax={evaluationProgress.totalSteps}');
    expect(text).toContain('evaluationProgress.currentStage');
    expect(text).toContain('evaluationStage === \'preparing\'');
    expect(text).toContain('evaluationStage === \'reading\'');
    expect(text).toContain('evaluationStage === \'grading\'');
    expect(text).toContain('evaluationStage === \'parsing\'');
    expect(text).toContain('evaluationStage === \'saving\'');
    expect(text).toContain('setEvaluationProgress((current) => current ? { ...current, completed: outputs.length, currentConfiguration: null, status: \'running\' } : current)');
    expect(styles).toContain('.evaluation-configuration-step.is-active');
    expect(styles).toContain('.evaluation-configuration-step.is-complete');
    expect(styles).toContain('.evaluation-phase-panel');
    expect(styles).toContain('@media (max-width: 700px)');
  });

  it('replaces the legacy Debug workspace with the live network inspector', () => {
    const text = app();
    const bootstrap = source('../src/main.tsx');
    expect(text).toContain('>Évaluation des modèles</button>');
    expect(text).toContain('>Inspecteur réseau</button>');
    expect(text).toContain("if ((interfaceMode as string) === 'debug')");
    expect(text).toContain("import { NetworkInspector } from './NetworkInspector.tsx'");
    expect(text).toContain('<NetworkInspector />');
    expect(bootstrap).toContain('installNetworkInspector()');
  });

  it('exposes an accessible switch whose buttons reflect the selected mode', () => {
    const text = app();
    expect(text).toContain('role="group" aria-label="Mode d’interface"');
    expect(text).toContain("aria-pressed={interfaceMode === 'teacher'}");
    expect(text).toContain("aria-pressed={interfaceMode === 'diagnostic'}");
    expect(text).toContain("onClick={() => setInterfaceMode('teacher')}");
    expect(text).toContain("setInterfaceMode('diagnostic')");
  });

  it('removes duplicate branding and makes missing local AI setup obvious in the sidebar', () => {
    const text = app();
    expect(text).not.toContain('<strong>Correction</strong><small>Espace enseignant</small>');
    expect(text).toContain('IA locale à configurer');
    expect(text).toContain('Configurer maintenant');
    expect(text).toContain('setShowAiSettings(true)');
    expect(text).toContain('is-processing');
    expect(text).toContain('Lecture des copies en cours');
    expect(text).toContain('Analyse et notation en cours');
  });

  it('keeps model evaluation configuration in its own workspace and advanced diagnostic settings in Debug', () => {
    const text = app();
    expect(text).toContain('id="evaluation-configurations"');
    expect(text).toContain('id="evaluation-profile-name"');
    expect(text).toContain('id="evaluation-vision-model"');
    expect(text).toContain('id="evaluation-analysis-model"');
    expect(text).toContain('id="evaluation-provider"');
    expect(text).toContain('API compatible OpenAI');
    expect(text).toContain('id="evaluation-api-key"');
    expect(text).toContain('value={apiKey}');
    expect(text).toContain('className="debug-advanced-settings"');
    expect(text).toContain('id="diagnostic-strategy"');
    expect(text).toContain("interfaceMode === 'teacher' && showAiSettings && <section className={`panel ollama-panel teacher-model-panel ai-settings-view");
    expect(text).toContain('Paramètres de l’IA locale');
    expect(text).toContain('aria-expanded={showAiSettings}');
  });

  it('offers on-demand Saluki 27B loading only for the OpenAI-compatible server', () => {
    const text = app();
    expect(text).toContain('Saluki 27B');
    expect(text).toContain('MODÈLE AVANCÉ · À LA DEMANDE');
    expect(text).toContain('POST <code>/v1/models/saluki-27b/load</code>');
    expect(text).toContain('handleLoadSaluki');
    expect(text).toContain("await loadSalukiModel({ endpoint, apiKey })");
    expect(text).toContain('system1-vision');
  });

  it('keeps model-evaluation streaming separate from technical debug traces', () => {
    const text = app();
    expect(text).toContain("evaluationWorkspaceStep === 'execution' && busy && streamedOutput && <section className=\"transcription-review\"");
    expect(text).toContain('Dernière réponse reçue en streaming');
    expect(text).toContain('debug-evaluation-traces');
  });

  it('offers integrated-question and separate-subject modes, with separate subject upload only when needed', () => {
    const text = app();
    expect(text).toContain("useState<'integrated' | 'separate'>(() => readActiveAssignmentProfile().correctionMode)");
    expect(text).toContain('Où se trouvent les questions ?');
    expect(text).toContain('Questions intégrées à la copie');
    expect(text).toContain('Sujet fourni séparément');
    expect(text).toContain("correctionMode === 'separate' && <section className={`panel subject-panel ${subjectReady ? 'setup-complete' : 'setup-needed'}`}");
    expect(text).toContain('id="subject-files"');
    expect(text).toContain('Sélectionnez uniquement les pages d’un même étudiant');
    expect(text).toContain('subjectImages');
    expect(text).toContain(`{interfaceMode === 'diagnostic' && <span className="number">02</span>}`);
    expect(text).toContain(`{interfaceMode === 'diagnostic' && <span className="number">03</span>}`);
  });

  it('starts new assignments with pedagogical context before the independent rubric', () => {
    const text = app();
    expect(text).toContain("setTeacherStep('details')");
    expect(text).toContain('ÉTAPE 0 · CONTEXTE');
    expect(text).toContain('Description et objectifs pédagogiques');
    expect(text).toContain('Niveau scolaire / universitaire');
    expect(text).toContain('id="assignment-education-level"');
    expect(text).toContain('buildAssignmentContext({ title: assignmentTitle, description: assignmentDescription, educationLevel, question })');
    expect(text).toContain('description: assignmentDescription, educationLevel');
  });

  it('provides a teacher-specific three-step navigation and shows only the active task', () => {
    const text = app();
    expect(text).toContain("useState<'details' | 'rubric' | 'copy' | 'progress' | 'review' | 'archive'>('rubric')");
    expect(text).toContain('aria-label="Navigation de la correction"');
    expect(text).toContain('aria-label="Étapes du devoir"');
    expect(text).toContain('Préparer le barème');
    expect(text).toContain('Ajouter une copie');
    expect(text).toContain('Réviser la note');
    expect(text).toContain('Suivi du traitement');
    expect(text).toContain("setTeacherStep('progress')");
    expect(text).toContain("(interfaceMode === 'diagnostic' && evaluationWorkspaceStep === 'configuration')");
    expect(text).toContain("(interfaceMode === 'diagnostic' && evaluationWorkspaceStep === 'configuration')");
    expect(text).toContain("setTeacherStep('review')");
    expect(text).toContain("const assignmentTitleKey = 'companion-correcteur:assignment-title:v1'");
    expect(text).toContain('setItem(assignmentTitleKey, assignmentTitle)');
    expect(text).not.toContain('Un devoir, un espace de travail');
  });

  it('keeps the dedicated evaluation workspace isolated from the teacher workspace', () => {
    const text = app();
    expect(text).toContain('className="evaluation-page-header"');
    expect(text).toContain('Évaluation des modèles');
    expect(text).toContain('ESPACE EXPÉRIMENTAL · OLLAMA LOCAL');
    expect(text).toContain('className="evaluation-step-nav"');
    expect(text).toContain('Modèles, barème et copie');
    expect(text).toContain('Notes, temps et tokens');
    expect(text).not.toContain('Un devoir, un espace de travail');
  });

  it('presents saved teacher decisions in plain language instead of technical local-memory terminology', () => {
    const text = source('../src/ui/LocalMemoryCompanion.tsx');
    expect(text).toContain('Règles de correction');
    expect(text).toContain('DÉCISIONS DE L’ENSEIGNANT');
    expect(text).toContain('Ici, vous indiquez à l’assistant comment appliquer votre correction.');
    expect(text).toContain('Votre décision');
    expect(text).toContain('Enregistrer la décision');
    expect(text).not.toContain('> Mémoire locale ');
  });

  it('explains the distinction between feedback for a correction and reusable rubric rules', () => {
    const text = source('../src/ui/LocalMemoryCompanion.tsx');
    expect(text).toContain('Correction active');
    expect(text).toContain('Barème utilisé');
    expect(text).toContain('Réutiliser cette décision avec le barème');
    expect(text).toContain('Sinon, elle reste limitée à la correction active.');
    expect(text).toContain('RÈGLE DU BARÈME');
    expect(text).toContain('RETOUR POUR CE DEVOIR');
  });

  it('keeps the extracted transcription available for teacher verification after image reading', () => {
    const text = app();
    expect(text).toContain('Vérifier le texte lu par l’IA');
    expect(text).toContain('Relisez la transcription pour repérer les erreurs de lecture');
    expect(text).toContain('{transcription && <section className="transcription-text-block">');
    expect(text).toContain('{correctionMode === \'separate\' && subjectTranscription && <section className="transcription-text-block">');
    expect(text).toContain('Texte de la copie étudiante');
    expect(text).toContain('Texte du sujet de référence');
    expect(text).toContain('className="transcription-review"');
  });

  it('records separate reading and analysis durations and keeps a local comparison history', () => {
    const text = app();
    expect(text).toContain("const timingHistoryKey = 'companion-correcteur:timing-history:v1'");
    expect(text).toContain('readingSeconds:');
    expect(text).toContain('analysisSeconds:');
    expect(text).toContain('totalSeconds:');
    expect(text).toContain('evaluationService.saveDiagnosticHistory(timingHistory)');
    expect(text).toContain('evaluationService.listDiagnosticHistory()');
    expect(text).toContain('window.localStorage.removeItem(timingHistoryKey)');
    expect(text).toContain('Tableau de bord des expériences');
    expect(text).toContain('LABORATOIRE LOCAL · OLLAMA');
    expect(text).toContain('Tableau de bord des expériences');
    expect(text).toContain('Modèles (lecture / analyse)');
    expect(text).toContain('Réutilisée / non mesurée');
    expect(text).toContain('Effacer l’historique');
    expect(text).toContain('pageCount: images.length');
  });
  it('shows a comparative analysis summary beyond raw model responses', () => {
    const text = app();
    const styles = source('../src/ui/styles.css');
    expect(text).toContain('Analyse comparative des configurations');
    expect(text).toContain('Écart entre les notes');
    expect(text).toContain('Note moyenne');
    expect(text).toContain('Critères en désaccord');
    expect(text).toContain('Questions à vérifier');
    expect(text).toContain('Critères à examiner en priorité');
    expect(text).toContain('faible confiance');
    expect(text).toContain('Afficher les comparaisons détaillées deux à deux');
    expect(text).toContain('Sans note de référence validée par l’enseignant');
    expect(styles).toContain('.evaluation-analysis-metrics');
    expect(styles).toContain('.evaluation-disagreement-list');
  });


  it('keeps model evaluation separate from correction and exposes profile creation in the evaluation workspace', () => {
    const text = app();
    const evaluation = text.slice(text.indexOf('id="evaluation-configurations"'), text.indexOf("interfaceMode === 'debug' ? <section"));
    expect(text).toContain('Évaluation des modèles');
    expect(text).toContain('id="evaluation-configurations"');
    expect(text).toContain('Nouvelle configuration');
    expect(text).toContain('Enregistrer la configuration');
    expect(text).toContain('id="evaluation-profile-name"');
    expect(text).toContain('id="evaluation-vision-model"');
    expect(text).toContain('id="evaluation-analysis-model"');
    expect(text).toContain('id="evaluation-results"');
    expect(text).toContain('Comparer les modèles Vision');
    expect(text).toContain('Comparer les modèles d’analyse');
    expect(text).toContain('Évaluer cette configuration');
    expect(text).toContain('Debug des appels IA locaux');
    expect(evaluation).toContain('Sélection pour cette expérience');
    expect(evaluation).not.toContain('Lancer la correction');
    expect(text).not.toContain('diagnostic-experiment-setup');
  });

  it('uses readable typography and responsive layout for the evaluation workspace', () => {
    const styles = source('../src/ui/styles.css');
    expect(styles).toContain('.evaluation-page-header');
    expect(styles).toContain('.evaluation-config-fields');
    expect(styles).toContain('.evaluation-run-actions');
    expect(styles).toContain('.debug-advanced-settings');
    expect(styles).toContain('.debug-performance-history');
    expect(styles).toContain('.debug-evaluation-traces');
    expect(styles).toContain('@media(max-width:760px)');
  });

});