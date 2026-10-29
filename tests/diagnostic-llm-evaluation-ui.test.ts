import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(resolve(process.cwd(), 'src/ui/App.tsx'), 'utf8');
const styles = readFileSync(resolve(process.cwd(), 'src/ui/correctionFlow.css'), 'utf8');

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
    expect(appSource).toContain('Qualité, coût et vitesse par modèle');
    expect(appSource).toContain('Compromis entre qualité et temps');
    expect(appSource).toContain('Proximité de la référence');
    expect(appSource).toContain('rubricSnapshot');
    expect(appSource).toContain('Erreur moyenne');
    expect(appSource).toContain('buildDiagnosticScore(parsed, rubric).modelScore');
    expect(appSource).toContain('setSelectedComparisonIds');
  });

  it('styles comparison charts responsively and respects reduced-motion preferences', () => {
    expect(styles).toContain('.diagnostic-comparison-charts');
    expect(styles).toContain('.diagnostic-comparison-models');
    expect(styles).toContain('.diagnostic-dashboard-kpis');
    expect(styles).toContain('.diagnostic-scatter');
    expect(styles).toContain('.diagnostic-model-score-grid');
    expect(styles).toContain('@media (max-width: 520px)');
    expect(styles).toContain('prefers-reduced-motion: reduce');
  });
});
