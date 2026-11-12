import type { AiModelProfile } from '../../domain/aiModelProfiles.ts';
import './BiologyRunMonitor.css';
import { QUESTION_CONTRACT_CASES } from '../../domain/questionContractPilot.ts';
import type { QuestionContractRun } from '../../domain/questionContractPilot.ts';
import { repeatabilitySuiteCases, type QuestionContractRepeatabilityRun, type RepeatabilityCount, type RepeatabilitySuite } from '../../domain/questionContractRepeatability.ts';

interface BiologyRunMonitorProps {
  scenario: 'contracts' | 'repeatability';
  automaticRun: boolean;
  currentCase: string | null;
  message: string;
  profiles: readonly AiModelProfile[];
  contractRuns: readonly QuestionContractRun[];
  repeatabilityRuns: readonly QuestionContractRepeatabilityRun[];
  repeatabilityPlanned: RepeatabilityCount;
  repeatabilitySuite: RepeatabilitySuite;
  repeatabilityProgress: { completed: number; total: number } | null;
  onStop: () => void;
}

function scoreLabel(run: QuestionContractRun | QuestionContractRepeatabilityRun | undefined): string {
  if (!run) return 'En attente';
  const results = run.record.results;
  if (!results.length) return 'Sans résultat';
  return results.map((result) => result.status === 'success' && result.score !== null
    ? result.score + '/10'
    : 'À vérifier').join(' · ');
}

export function BiologyRunMonitor({
  scenario, automaticRun, currentCase, message, profiles, contractRuns, repeatabilityRuns,
  repeatabilityPlanned, repeatabilitySuite, repeatabilityProgress, onStop,
}: BiologyRunMonitorProps) {
  const contracts = scenario === 'contracts';
  const cases = contracts ? QUESTION_CONTRACT_CASES : repeatabilitySuiteCases(repeatabilitySuite);
  // Each contract record is one sequential case/variant call (possibly several profiles).
  // Repeatability progress likewise counts case × passage calls, not individual profile results.
  const total = contracts ? QUESTION_CONTRACT_CASES.length * 2
    : repeatabilityProgress?.total ?? cases.length * repeatabilityPlanned;
  const completed = contracts ? contractRuns.length
    : repeatabilityProgress?.completed ?? repeatabilityRuns.length;
  const percentage = Math.round(100 * Math.min(total, completed) / Math.max(1, total));
  const activeRuns = contracts
    ? contractRuns.filter((run) => run.caseId === currentCase)
    : repeatabilityRuns.filter((run) => run.caseId === currentCase);
  const activeDetail = !currentCase ? 'Préparation du prochain appel'
    : contracts ? 'Copie ' + currentCase + ' · ' +
      (activeRuns.some((run) => 'variant' in run && run.variant === 'standard') ? 'contrat par question' : 'barème standard')
      : 'Copie ' + currentCase + ' · passage ' + Math.min(repeatabilityPlanned, activeRuns.length + 1) + '/' + repeatabilityPlanned;

  return <section className="biology-run-monitor"
    aria-label={automaticRun ? 'Avancement automatique de la biologie' : 'Suivi du test biologique'}>
    <header className="biology-run-header">
      <div className="biology-run-intro">
        <p className="biology-run-eyebrow">ÉVALUATION EN COURS</p>
        <h3>{contracts ? 'Comparaison du barème · copies A/B/C'
          : repeatabilitySuite === 'stress' ? 'Robustesse · pièges D/E/F/G' : 'Répétabilité · copies A/B/C'}</h3>
        <p>{profiles.length ? profiles.map((profile) => profile.name).join(' · ') : 'Modèle en cours de préparation'}</p>
      </div>
      <div className="biology-run-tally">
        <strong>{completed} <span>/ {total}</span></strong>
        <span>étapes terminées</span>
      </div>
    </header>
    <div className="biology-run-progress">
      <progress aria-label="Progression de l’étape biologique" max={total} value={completed} />
      <span>{percentage} %</span>
    </div>
    <div className="biology-run-current" role="status" aria-live="polite">
      <span className="biology-run-activity-dot" aria-hidden="true" />
      <div>
        <strong>{activeDetail}</strong>
        <p>{message || 'Analyse en cours : les résultats arrivent après chaque appel au modèle.'}</p>
      </div>
    </div>
    <div className="biology-run-case-heading">
      <h4>Avancement par copie</h4>
      <small>Référence du professeur / réponse du modèle</small>
    </div>
    <ol className="biology-run-cases" aria-label="Avancement des copies de référence">
      {cases.map((testCase) => {
        const isActive = currentCase === testCase.id;
        const related = contracts ? contractRuns.filter((run) => run.caseId === testCase.id)
          : repeatabilityRuns.filter((run) => run.caseId === testCase.id);
        const needed = contracts ? 2 : repeatabilityPlanned;
        const complete = related.length >= needed;
        return <li key={testCase.id}
          className={'biology-run-case' + (isActive && !complete ? ' is-active' : '') + (complete ? ' is-complete' : '')}>
          <div className="biology-run-case-top">
            <div>
              <strong>Copie {testCase.id}</strong>
              <span>Note attendue : {testCase.referenceScore}/10</span>
            </div>
            <span className="biology-run-case-state">{complete ? 'Traitée' : isActive ? 'En cours' : related.length ? 'Partielle' : 'À venir'}</span>
          </div>
          {contracts ? <div className="biology-run-case-results">
            {(['standard', 'contract'] as const).map((variant) => {
              const run = contractRuns.find((item) => item.caseId === testCase.id && item.variant === variant);
              return <div key={variant}>
                <small>{variant === 'standard' ? 'Barème standard' : 'Contrat par question'}</small>
                <strong>{scoreLabel(run)}</strong>
              </div>;
            })}
          </div> : <div className="biology-run-case-results">
            <div>
              <small>Passages effectués</small>
              <strong>{related.length} / {repeatabilityPlanned}</strong>
            </div>
            <div>
              <small>Dernière note du modèle</small>
              <strong>{scoreLabel(related.at(-1))}</strong>
            </div>
          </div>}
        </li>;
      })}
    </ol>
    <footer className="biology-run-footer">
      <p>Les réponses de référence sont intégrées : aucune transcription à saisir. Vous pouvez consulter les résultats détaillés une fois la campagne terminée.</p>
      <button type="button" className="secondary-button" onClick={onStop}>Arrêter après l’appel en cours</button>
    </footer>
  </section>;
}
