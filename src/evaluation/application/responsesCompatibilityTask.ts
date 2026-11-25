import {
  compareResponsesModes, responsesEffortLabel, responsesModeLabel,
  type ResponsesEffort, type ResponsesTestSettings, type ResponsesTrialResult,
} from './responsesCompatibility.ts';

interface CompatibilitySnapshot {
  model: string;
  message: string;
  startedAt: number | null;
  results: readonly ResponsesTrialResult[];
}

let snapshot: CompatibilitySnapshot = { model: '', message: '', startedAt: null, results: [] };
let controller: AbortController | undefined;
const listeners = new Set<() => void>();

export const getResponsesCompatibilityTask = () => snapshot;

export function subscribeResponsesCompatibilityTask(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function publish(patch: Partial<CompatibilitySnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach(listener => listener());
}

export async function launchResponsesCompatibilityTask(
  settings: ResponsesTestSettings, efforts: readonly ResponsesEffort[],
): Promise<void> {
  if (controller || efforts.length === 0) return;
  const request = new AbortController();
  controller = request;
  publish({ model: settings.analysisModel, startedAt: Date.now(), results: [] });
  try {
    await compareResponsesModes(settings, efforts, request.signal,
      (trial, index, total) => publish({
        message: `Essai ${index}/${total} · ${responsesModeLabel(trial.stream)} · Thinking ${responsesEffortLabel[trial.effort]} · Attente du résultat`,
      }),
      result => publish({ results: [...snapshot.results, result] }));
    publish({ message: `Comparaison terminée · ${snapshot.results.length} essais` });
  } catch (error) {
    publish({ message: request.signal.aborted ? `Comparaison arrêtée · ${snapshot.results.length} essais terminés`
      : error instanceof Error ? error.message : 'Comparaison interrompue' });
  } finally {
    controller = undefined;
    publish({ startedAt: null });
  }
}

export function stopResponsesCompatibilityTask(): void {
  controller?.abort();
}
