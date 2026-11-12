import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ModelEvaluationRecord } from '../../domain/modelEvaluation.ts';
import type { QuestionContractRun } from '../../domain/questionContractPilot.ts';
import type { QuestionContractRepeatabilityRun } from '../../domain/questionContractRepeatability.ts';
import { BiologyRunMonitor } from './BiologyRunMonitor.tsx';

const record = (status: 'success' | 'failed', score: number | null): ModelEvaluationRecord =>
  ({ results: [{ status, score }] }) as unknown as ModelEvaluationRecord;

const props = {
  scenario: 'contracts' as const,
  automaticRun: true,
  currentCase: 'A',
  message: 'Contrats par question · copie A · variante B enrichie',
  profiles: [],
  contractRuns: [{ caseId: 'A', variant: 'standard', record: record('success', 8) }] as QuestionContractRun[],
  repeatabilityRuns: [] as QuestionContractRepeatabilityRun[],
  repeatabilityPlanned: 3 as const,
  repeatabilitySuite: 'stress' as const,
  repeatabilityProgress: null,
  onStop: () => {},
};

describe('live biology monitor', () => {
  it('presents the active variant, expected teacher score and measured grade without claiming it is correct', () => {
    const html = renderToStaticMarkup(<BiologyRunMonitor {...props} />);
    expect(html).toContain('Avancement automatique de la biologie');
    expect(html).toContain('Copie A · contrat par question');
    expect(html).toContain('Note attendue : 10/10');
    expect(html).toContain('8/10');
    expect(html).toContain('En attente');
    expect(html).toContain('1 <span>/ 6</span>');
    expect(html).not.toContain('Comparer standard et variante B en un clic');
    expect(html).toContain('Arrêter après l’appel en cours');
    expect(html).toContain('value="1"');
    expect(html).toContain('max="6"');
  });

  it('does not convert a null grade or failed call into a zero', () => {
    const html = renderToStaticMarkup(<BiologyRunMonitor {...props}
      contractRuns={[
        { caseId: 'A', variant: 'standard', record: record('success', null) },
        { caseId: 'A', variant: 'contract', record: record('failed', 0) },
      ]} />);
    expect(html).toContain('À vérifier');
    expect(html).toContain('Copie A');
    expect(html).toContain('Traitée');
    expect(html).not.toContain('0/10</strong>');
  });

  it('shows real robustness progress per copy and passage, not a second configuration form', () => {
    const runs: QuestionContractRepeatabilityRun[] = [
      { caseId: 'D', repetition: 1, record: record('success', 0) },
      { caseId: 'E', repetition: 1, record: record('success', 10) },
      { caseId: 'F', repetition: 1, record: record('success', 6) },
      { caseId: 'G', repetition: 1, record: record('success', 0) },
      { caseId: 'D', repetition: 2, record: record('success', 0) },
    ];
    const html = renderToStaticMarkup(<BiologyRunMonitor {...props}
      scenario="repeatability" currentCase="E" repeatabilityRuns={runs}
      repeatabilityProgress={{ completed: 5, total: 12 }} />);
    expect(html).toContain('Robustesse · pièges D/E/F/G');
    expect(html).toContain('Copie E · passage 2/3');
    expect(html).toContain('Passages effectués');
    expect(html).toContain('Dernière note du modèle');
    expect(html).toContain('5 <span>/ 12</span>');
    expect(html).toContain('value="5"');
    expect(html).toContain('max="12"');
  });
});
