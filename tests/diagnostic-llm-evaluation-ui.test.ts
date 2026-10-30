import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(resolve(process.cwd(), 'src/ui/App.tsx'), 'utf8');
const domainSource = readFileSync(resolve(process.cwd(), 'src/domain/modelEvaluation.ts'), 'utf8');
const styles = readFileSync(resolve(process.cwd(), 'src/ui/correctionFlow.css'), 'utf8');
const evaluationStyles = readFileSync(resolve(process.cwd(), 'src/ui/styles.css'), 'utf8');

describe('Diagnostic IA — indicateurs d’évaluation des LLM', () => {
  it('exposes output validity, criterion coverage, declared confidence and teacher questions per run', () => {
    expect(appSource).toContain('Format exploitable');
    expect(appSource).toContain('Critères évalués');
    expect(appSource).toContain('Confiance moyenne déclarée');
    expect(appSource).toContain('Questions au professeur');
  });

  it('makes low-confidence criteria and missing evidence visible', () => {
    expect(appSource).toContain('Confiance déclarée :');
    expect(appSource).toContain('Aucune preuve textuelle fournie');
    expect(appSource).toContain('diagnostic-raw-warning');
  });

  it('keeps the diagnostic indicators responsive on narrow screens', () => {
    expect(styles).toContain('.diagnostic-run-metrics');
    expect(styles).toContain('@media (max-width: 760px)');
    expect(styles).toContain('@media (max-width: 380px)');
  });
});

describe('Diagnostic IA — correction de référence facultative', () => {
  it('keeps model experiments independent from a teacher reference', () => {
    expect(appSource).toContain('Correction de référence');
    expect(appSource).toContain('(facultative)');
    expect(appSource).toContain('Aucune référence n’est nécessaire pour lancer ou comparer des essais.');
  });

  it('records teacher scores locally and displays model accuracy metrics', () => {
    expect(appSource).toContain('saveDiagnosticReference');
    expect(appSource).toContain('window.localStorage.setItem(timingHistoryKey, JSON.stringify(next))');
    expect(appSource).toContain('Erreur moyenne :');
    expect(appSource).toContain('Correspondances exactes :');
    expect(appSource).toContain('Écart de note totale :');
  });
});

describe('Diagnostic IA — consommation réelle des modèles Ollama', () => {
  it('shows token usage, per-model timing, generation speed and local hardware-loading time in history', () => {
    expect(appSource).toContain('Tokens consommés');
    expect(appSource).toContain('Usage par modèle');
    expect(appSource).toContain('Tokens d’entrée');
    expect(appSource).toContain('Tokens générés');
    expect(appSource).toContain('Vitesse de génération pondérée');
    expect(appSource).toContain('Chargement :');
    expect(appSource).toContain('Fin de génération');
    expect(appSource).toContain('Limite atteinte (length)');
    expect(appSource).toContain('Contexte demandé');
    expect(appSource).toContain('Raisonnement séparé');
    expect(appSource).toContain('Les tokens sont les compteurs remontés par Ollama');
  });

  it('aggregates repeated calls per model and stage without treating missing metadata as zero usage', () => {
    expect(appSource).toContain('function groupDiagnosticUsage');
    expect(appSource).toContain('measuredCalls');
    expect(appSource).toContain('Non fournis par Ollama pour cet essai');
    expect(appSource).toContain('formatTokenCount');
  });

  it('keeps the usage dashboard responsive', () => {
    expect(styles).toContain('.diagnostic-usage-overview');
    expect(styles).toContain('.diagnostic-usage-groups');
    expect(styles).toContain('@media (max-width: 420px)');
  });
});


describe('Diagnostic IA — comparaison graphique des essais conservés', () => {
  it('offers selection of two past experiments and charts for time, tokens and score', () => {
    expect(appSource).toContain('Sélectionner l’essai');
    expect(appSource).toContain('Comparer deux essais');
    expect(appSource).toContain('Comparaison de deux essais');
    expect(appSource).toContain('Tokens d’entrée');
    expect(appSource).toContain('Tokens générés');
    expect(appSource).toContain('Temps et tokens par modèle / étape');
    expect(appSource).toContain('Debug des appels IA locaux');
    expect(appSource).toContain('debug-performance-history');
    expect(appSource).toContain('Qualité, coût et vitesse par modèle');
    expect(appSource).toContain('Compromis entre qualité et temps');
    expect(appSource).toContain('Proximité de la référence');
    expect(appSource).toContain('rubricSnapshot');
    expect(appSource).toContain('Erreur moyenne');
    expect(appSource).toContain('buildDiagnosticScore(parsed, recordRubric)');
    expect(appSource).toContain('setSelectedComparisonIds');
  });

  it('styles comparison charts responsively and respects reduced-motion preferences', () => {
    expect(styles).toContain('.diagnostic-comparison-charts');
    expect(styles).toContain('.diagnostic-comparison-models');
    expect(styles).toContain('.diagnostic-workspace-hero');
    expect(styles).toContain('.diagnostic-dashboard-kpis');
    expect(styles).toContain('.diagnostic-scatter');
    expect(styles).toContain('.diagnostic-model-score-grid');
    expect(styles).toContain('@media (max-width: 520px)');
    expect(styles).toContain('prefers-reduced-motion: reduce');
  });
});


describe('Évaluation des modèles — navigation par espace', () => {
  it('provides four focused spaces and marks the selected step accessibly', () => {
    expect(appSource).toContain("useState<'configuration' | 'execution' | 'results' | 'history'>('configuration')");
    expect(appSource).toContain('Espaces de l’évaluation');
    expect(appSource).toContain('Analyse & historique');
    expect(appSource).toContain("aria-current={evaluationWorkspaceStep === 'history' ? 'step' : undefined}");
  });

  it('keeps configuration and rubric preparation out of execution and history views', () => {
    expect(appSource).toContain("evaluationWorkspaceStep === 'configuration' && <section id=\"evaluation-configurations\"");
    expect(appSource).toContain("(interfaceMode === 'diagnostic' && evaluationWorkspaceStep === 'configuration')");
    expect(appSource).toContain("evaluationWorkspaceStep !== 'configuration' && <section id=\"evaluation-results\"");
  });

  it('separates live execution, result comparison and historical analysis visually', () => {
    expect(evaluationStyles).toContain('.evaluation-results-workspace[data-evaluation-step="execution"] .evaluation-result-list');
    expect(evaluationStyles).toContain('.evaluation-results-workspace[data-evaluation-step="results"] .evaluation-result-list');
    expect(evaluationStyles).toContain('.evaluation-results-workspace[data-evaluation-step="history"] .evaluation-progress');
    expect(evaluationStyles).toContain('.evaluation-step-nav button.is-active');
  });
});


describe('Évaluation des modèles — comparaison graphique de l’historique', () => {
  it('stores token usage separately for reading and analysis while preserving legacy records', () => {
    expect(appSource).toContain("sumReportedTokensForStage(measuredRuns, 'reading')");
    expect(appSource).toContain('readingTokens: output.value?.readingTokens ?? null');
    expect(appSource).toContain('analysisTokens: output.value?.analysisTokens ?? null');
    expect(domainSource).toContain('readingTokens?: number | null');
    expect(domainSource).toContain('analysisTokens?: number | null');
  });

  it('filters history by evaluation stage and compares models from one run or two runs of the same stage', () => {
    expect(appSource).toContain('evaluationHistoryStageFilter');
    expect(appSource).toContain('evaluation-history-stage-filter');
    expect(appSource).toContain('selectedEvaluationHistoryIds');
    expect(appSource).toContain('canCompareModelEvaluationRecords(selectedEvaluationHistoryRecords)');
    expect(appSource).toContain('Comparaison des modèles Vision');
    expect(appSource).toContain('Comparaison des modèles d’analyse');
    expect(appSource).toContain('Comparaison du parcours complet');
    expect(appSource).toContain("title: 'Temps de lecture'");
    expect(appSource).toContain("title: 'Temps d’analyse'");
    expect(appSource).toContain("title: 'Tokens de lecture'");
    expect(appSource).toContain("title: 'Tokens d’analyse'");
    expect(appSource).toContain("title: 'Note proposée'");
    expect(appSource).toContain('Comparer les transcriptions');
    expect(appSource).toContain("aria-label={'Graphique ' + metric.title}");
    expect(appSource).toContain('Non mesuré');
  });

  it('preserves the common Analysis input and explains the limits of cross-run comparisons', () => {
    expect(domainSource).toContain('referenceTranscription?: string | null');
    expect(domainSource).toContain('sameAnalysisInput');
    expect(domainSource).toContain('sameImages(first.images, second.images)');
    expect(appSource).toContain("referenceTranscription: evaluationStageMode === 'analysis' ? transcription : null");
    expect(appSource).toContain("transcription: evaluationStageMode === 'analysis' ? transcription ?? '' : output.value?.transcription ?? ''");
    expect(appSource).toContain('Transcription commune notée');
    expect(appSource).toContain('Comparer les notes par critère');
    expect(appSource).toContain('Justifications et preuves');
  });

  it('styles the comparison charts responsively and respects reduced-motion settings', () => {
    expect(evaluationStyles).toContain('.evaluation-history-chart-grid');
    expect(evaluationStyles).toContain('.evaluation-history-stage-filter');
    expect(evaluationStyles).toContain('.evaluation-history-transcriptions');
    expect(evaluationStyles).toContain('.evaluation-history-bar-fill.experiment-1');
    expect(evaluationStyles).toContain('@media(max-width:760px){.evaluation-history-selection');
    expect(evaluationStyles).toContain('prefers-reduced-motion:reduce){.evaluation-history-bar-fill');
  });
});


describe('Évaluation des modèles — cohérence des étapes et historique', () => {
  it('uses the correct step number and heading for execution, results and history', () => {
    expect(appSource).toContain("evaluationWorkspaceStep === 'execution' ? 'ÉTAPE 2 · EXÉCUTION'");
    expect(appSource).toContain("evaluationWorkspaceStep === 'results' ? 'ÉTAPE 3 · RÉSULTATS'");
    expect(appSource).toContain("'ÉTAPE 4 · ANALYSE & HISTORIQUE'");
    expect(appSource).toContain("evaluationWorkspaceStep === 'history' && <section className=\"evaluation-result-list evaluation-history-workspace\"");
    expect(appSource).toContain("evaluationWorkspaceStep === 'results' && modelEvaluationResults.some");
  });

  it('presents each saved experiment as a structured card with model and stage metrics', () => {
    expect(appSource).toContain('evaluation-history-record-heading');
    expect(appSource).toContain('evaluation-history-model-name');
    expect(appSource).toContain('evaluation-history-model-stats');
    expect(appSource).toContain('evaluation-history-record-footer');
    expect(evaluationStyles).toContain('.evaluation-history-model-stats');
    expect(evaluationStyles).toContain('@media(max-width:620px){.evaluation-history-record');
  });
});

describe('Évaluation des modèles — débit de génération', () => {
  it('shows reading and analysis tokens per second in current results and saved history', () => {
    expect(appSource).toContain('readingTokensPerSecond');
    expect(appSource).toContain('analysisTokensPerSecond');
    expect(appSource).toContain('evaluation-throughput');
    expect(appSource).toContain("title: 'Débit de lecture'");
    expect(appSource).toContain("title: 'Débit d’analyse'");
    expect(appSource).toContain('tokens/s');
  });

  it('keeps missing throughput explicitly unknown for older records', () => {
    expect(appSource).toContain("result.readingTokensPerSecond == null ? 'Débit non mesuré'");
    expect(appSource).toContain("result.analysisTokensPerSecond == null ? 'Débit non mesuré'");
    expect(appSource).toContain("result.readingTokensPerSecond == null ? '—'");
  });
});

describe('Évaluation des modèles — navigation et alignement du contenu', () => {
  it('keeps the laboratory sidebar sticky on desktop and static in the responsive layout', () => {
    expect(evaluationStyles).toContain('.evaluation-step-nav{position:sticky;top:18px;z-index:1;display:flex;');
    expect(evaluationStyles).toContain('@media(max-width:999px){.evaluation-step-nav{position:static;');
  });

  it('aligns the configuration and experiment panels in the same desktop content column', () => {
    expect(evaluationStyles).toContain('@media(min-width:1000px){.evaluation-step-nav{float:left;width:224px;margin-right:24px}.evaluation-config-workspace,.evaluation-results-workspace{margin-left:248px}');
  });
});

describe('Durées réelles des étapes de traitement', () => {
  it('keeps the measured reading and analysis durations visible in the teacher review', () => {
    expect(appSource).toContain('readingElapsedMs');
    expect(appSource).toContain('analysisElapsedMs');
    expect(appSource).toContain('Lecture de l’image :');
    expect(appSource).toContain('Analyse et notation :');
    expect(appSource).toContain('completed-stage-timings');
    expect(styles).toContain('.completed-stage-timings');
  });

  it('tracks model evaluation progress for each completed reading and analysis stage', () => {
    expect(domainSource).toContain('completedSteps');
    expect(domainSource).toContain('totalSteps');
    expect(domainSource).toContain('currentStage');
    expect(appSource).toContain('Étapes de traitement terminées');
    expect(appSource).toContain('evaluationProgress.completedSteps');
    expect(appSource).toContain("onStage('reading')");
    expect(appSource).toContain("onStage('analysis')");
  });
});
