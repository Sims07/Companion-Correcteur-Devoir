export type EvaluationActivityJourney = 'custom' | 'diagrams' | 'biology';
export type EvaluationActivityStatus = 'running' | 'completed' | 'cancelled' | 'failed';

export interface EvaluationActivityOutcome {
  journey: EvaluationActivityJourney;
  interrupted: boolean;
  pilotMemoryError: string | null;
  pilotMessage: string;
  outcome: unknown;
}

/** The transport succeeded, but an incomplete or wholly indeterminate
 * diagram report cannot be announced as a completed scientific test. */
/** Only fixed categories from archived diagram experiments are shown. Never echo
 * provider errors, transcriptions, prompts or the contents of a student's copy. */
const diagramFailureLabels: Record<string, string> = {
  'model-unavailable': 'Modèle absent sur le serveur Ollama',
  'unsupported-chat': 'Modèle décisionnel utilisé en Vision : /api/chat non pris en charge',
  connection: 'Connexion au serveur impossible',
  'system-one-unavailable': 'API System One indisponible ou refusée (vérifier /v1/systemone et le modèle décisionnel)',
  'generation-limit': 'Limite de génération atteinte',
  'invalid-or-incomplete-output': 'Réponse du modèle incomplète ou invalide',
  timeout: 'Délai de réponse dépassé',
  'invalid-output': 'Observation visuelle invalide',
  network: 'Erreur réseau',
  cancelled: 'Appel annulé',
  other: 'Erreur à examiner dans Observabilité',
};

function diagramReportIssue(outcome: unknown): string | null {
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) return null;
  const report = outcome as { format?: unknown; cases?: unknown; experiments?: unknown };
  if (typeof report.format !== 'string' || !report.format.startsWith('companion-scientific-diagram-')) return null;
  const cases = Array.isArray(report.cases) ? report.cases : [];
  const runs = (cases.length ? cases.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const experiments = (item as { experiments?: unknown }).experiments;
    return Array.isArray(experiments) ? experiments : [];
  }) : Array.isArray(report.experiments) ? report.experiments : [])
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  if (!runs.length) return 'Aucun passage scientifique enregistré.';
  const successes = runs.filter((run) => run.status === 'success').length;
  if (successes < runs.length) {
    const failed = runs.filter((run) => run.status === 'failed').length;
    const stopped = runs.filter((run) => run.status === 'aborted' || run.status === 'cancelled').length;
    const counts = new Map<string, number>();
    for (const run of runs.filter((item) => item.status !== 'success')) {
      const category = typeof run.failureCategory === 'string' && Object.hasOwn(diagramFailureLabels, run.failureCategory)
        ? run.failureCategory
        : typeof run.errorCategory === 'string' && Object.hasOwn(diagramFailureLabels, run.errorCategory)
          ? run.errorCategory : 'other';
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    const reasons = [...counts].map(([category, count]) => diagramFailureLabels[category] + ' : ' + count).join(' ; ');
    return successes + '/' + runs.length + ' passages réussis. ' +
      failed + ' en échec' + (stopped ? ', ' + stopped + ' annulé(s)' : '') +
      '. Causes : ' + reasons + '. Les détails techniques restent consultables dans Observabilité.';
  }
  const hasDecision = runs.some((run) => {
    const observations = Array.isArray(run.observations)
      ? run.observations.map((item) => item && typeof item === 'object'
        ? (item as { choice?: unknown }).choice : undefined)
      : run.observations && typeof run.observations === 'object'
        ? Object.values(run.observations) : [];
    return observations.some((choice) => choice === 'present' || choice === 'absent' || choice === 'partial');
  });
  return hasDecision ? null : 'Passages terminés, mais aucune décision scientifique exploitable pour le radar.';
}

export function resolveEvaluationActivityOutcome(value: EvaluationActivityOutcome): {
  status: Exclude<EvaluationActivityStatus, 'running'>;
  error?: string;
} {
  if (value.interrupted) return { status: 'cancelled' };
  const pilotMessageError = value.journey === 'biology' &&
    /^(Erreur|Échec|Gestionnaire|Le benchmark|Ajoutez|Sélectionnez|Essai «.+ interrompu)/i.test(value.pilotMessage)
      ? value.pilotMessage : '';
  const diagramIssue = value.journey === 'diagrams' ? diagramReportIssue(value.outcome) : null;
  const failed = Boolean(value.pilotMemoryError || pilotMessageError || diagramIssue ||
    (value.journey === 'custom' && value.outcome === undefined) ||
    (typeof value.outcome === 'number' && value.outcome === 0));
  return failed
    ? { status: 'failed', error: value.pilotMemoryError || pilotMessageError ||
      diagramIssue || 'Aucun résultat exploitable pour cette tentative.' }
    : { status: 'completed' };
}
