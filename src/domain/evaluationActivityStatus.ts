export type EvaluationActivityJourney = 'custom' | 'diagrams' | 'biology';
export type EvaluationActivityStatus = 'running' | 'completed' | 'cancelled' | 'failed';

export interface EvaluationActivityOutcome {
  journey: EvaluationActivityJourney;
  interrupted: boolean;
  pilotMemoryError: string | null;
  pilotMessage: string;
  outcome: unknown;
}

export function resolveEvaluationActivityOutcome(value: EvaluationActivityOutcome): {
  status: Exclude<EvaluationActivityStatus, 'running'>;
  error?: string;
} {
  if (value.interrupted) return { status: 'cancelled' };
  const pilotMessageError = value.journey === 'biology' &&
    /^(Erreur|Échec|Gestionnaire|Le benchmark|Ajoutez|Sélectionnez|Essai «.+ interrompu)/i.test(value.pilotMessage)
      ? value.pilotMessage : '';
  const failed = Boolean(value.pilotMemoryError || pilotMessageError ||
    (value.journey === 'custom' && value.outcome === undefined) ||
    (typeof value.outcome === 'number' && value.outcome === 0));
  return failed
    ? { status: 'failed', error: value.pilotMemoryError || pilotMessageError || 'Aucun résultat exploitable pour cette tentative.' }
    : { status: 'completed' };
}
