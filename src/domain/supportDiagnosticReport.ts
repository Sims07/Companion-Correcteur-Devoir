import { getObservabilityStage, type ObservabilityTrace } from './observability.ts';

/** Minimal metadata contract: the domain must not depend on the HTTP adapter. */
export type SupportNetworkRequest = {
  method: string;
  startedAt: string;
  durationMs: number | null;
  state: 'pending' | 'success' | 'error';
  status: number | null;
};

type SupportDiagnosticInput = {
  traces: ObservabilityTrace[];
  requests: SupportNetworkRequest[];
  generatedAt: string;
};

function date(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : 'date inconnue';
}

function duration(value: number | null): string {
  return value !== null && Number.isFinite(value) && value >= 0 ? `${Math.round(value)} ms` : 'durée non mesurée';
}

function safeModel(value: string): string {
  const name = value.replace(/[\r\n\t]/g, ' ').trim();
  return name ? name.slice(0, 100) : 'non renseigné';
}

function safeMethod(value: string): string {
  const method = value.toUpperCase();
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method) ? method : 'HTTP';
}

function safeStatus(value: number | null): string {
  return value !== null && Number.isInteger(value) && value >= 100 && value <= 599 ? String(value) : 'échec réseau';
}

function safeSource(value: ObservabilityTrace['source']): string {
  switch (value) {
    case 'model-evaluation': return 'évaluation de modèle';
    case 'rubric-import': return 'import de barème';
    case 'scientific-diagram': return 'analyse de schéma';
    default: return 'correction';
  }
}

/**
 * Support metadata only: deliberately excludes student names, assignment titles, images,
 * rubrics, transcriptions, scores, prompts, outputs, URL, headers, payloads and raw errors.
 * HTTP requests and execution traces are not automatically correlated.
 */
export function buildSupportDiagnosticReport({ traces, requests, generatedAt }: SupportDiagnosticInput): string {
  const failedTraces = traces.filter((trace) => trace.outcome === 'error')
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt)).slice(0, 5);
  const failedRequests = requests.filter((request) => request.state === 'error')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8);

  const lines = [
    'Compagnon Correcteur — diagnostic technique',
    `Généré le : ${date(generatedAt)}`,
    'Contenu : métadonnées techniques uniquement. Aucun contenu de copie, sujet, barème, prompt, réponse ou URL.',
    'Les erreurs HTTP ne sont pas automatiquement associées aux exécutions IA.',
    '',
    `Exécutions enregistrées : ${traces.length} · Échecs : ${traces.filter((trace) => trace.outcome === 'error').length}`,
    `Requêtes HTTP enregistrées : ${requests.length} · Erreurs : ${requests.filter((request) => request.state === 'error').length} · En cours : ${requests.filter((request) => request.state === 'pending').length}`,
    '',
    'Dernières exécutions en échec :',
    ...(!failedTraces.length ? ['- Aucune'] : failedTraces.map((trace) => {
      const failedCall = [...(trace.diagnosticRuns ?? [])].reverse().find((call) => Boolean(call.error));
      const model = failedCall ? safeModel(failedCall.model) : 'non identifié';
      const stage = failedCall ? getObservabilityStage(failedCall) : 'non identifiée';
      const seconds = Number.isFinite(trace.totalSeconds) && trace.totalSeconds >= 0 ? `${Math.round(trace.totalSeconds)} s` : 'non mesurée';
      return `- ${date(trace.completedAt)} · ${safeSource(trace.source)} · étape ${stage} · modèle ${model} · durée ${seconds}`;
    })),
    '',
    'Dernières requêtes HTTP en erreur :',
    ...(!failedRequests.length ? ['- Aucune'] : failedRequests.map((request) =>
      `- ${date(request.startedAt)} · ${safeMethod(request.method)} · HTTP ${safeStatus(request.status)} · ${duration(request.durationMs)}`)),
  ];
  return lines.join('\n');
}
