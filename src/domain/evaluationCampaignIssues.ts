import type { BiologyRadarObservation } from './biologyTeacherRadar.ts';
import type { DiagramLabArchiveEntry } from './diagramLabHistory.ts';
import type { ModelEvaluationRecord } from './modelEvaluation.ts';
import { failureCategory } from './evaluationIssueReport.ts';

/**
 * A compact, allowlisted list of problems to paste into a support conversation.
 * Never pass through raw errors, prompts, transcriptions, image data, endpoints
 * or the arbitrary contents of a saved scientific graph.
 */
const CAUSES: Record<string, string> = {
  'model-unavailable': 'modèle non installé',
  connection: 'connexion au serveur impossible',
  'system-one-unavailable': 'API System One incompatible ou indisponible',
  'unsupported-chat': 'modèle incompatible avec /api/chat',
  'generation-limit': 'limite de génération atteinte',
  'invalid-or-incomplete-output': 'réponse du modèle invalide ou incomplète',
  timeout: 'délai dépassé',
  other: 'échec technique non détaillé',
  'invalid-output': 'observation visuelle invalide',
  network: 'erreur réseau',
  cancelled: 'appel annulé',
};
const OUTPUT_ERRORS: Record<string, string> = {
  'invalid-json': 'JSON invalide',
  'invalid-shape': 'structure invalide',
  'missing-id': 'identifiant manquant',
  'unknown-id': 'identifiant inconnu',
  'missing-evidence': 'preuve manquante',
  'invalid-points': 'points invalides',
  'invalid-confidence': 'confiance invalide',
  'generation-limit': 'limite de génération',
};

function safeName(value: unknown): string {
  if (typeof value !== 'string') return 'non communiqué';
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 80 &&
    /^[A-Za-zÀ-ÿ0-9 ._:+/-]+$/.test(trimmed) &&
    !/https?:|\\|\/\/|@/i.test(trimmed) ? trimmed : 'non communiqué';
}
function safeCase(value: unknown): string {
  return typeof value === 'string' && /^[A-GS][0-9]?$/.test(value) ? value : 'non communiqué';
}
function repetition(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100000 ? value : null;
}
function status(value: unknown): string {
  return value === 'failed' || value === 'error' ? 'échec'
    : value === 'aborted' || value === 'cancelled' ? 'interrompu'
      : 'incomplet';
}
function cause(value: unknown): string {
  return typeof value === 'string' && Object.hasOwn(CAUSES, value) ? CAUSES[value]! : 'cause non enregistrée';
}
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function diagnostics(value: unknown): string {
  const data = asRecord(value);
  const metrics = [
    ['analysisCalls', 'appels analyse'],
    ['repairCalls', 'relances de format'],
    ['generationLimitHits', 'limites atteintes'],
  ] as const;
  const parts = metrics.flatMap(([key, label]) => {
    const n = count(data[key]);
    return n === null ? [] : [label + ' : ' + n];
  });
  if (typeof data.outputFailure === 'string' && Object.hasOwn(OUTPUT_ERRORS, data.outputFailure)) {
    parts.push('sortie : ' + OUTPUT_ERRORS[data.outputFailure]!);
  }
  return parts.length ? ' · ' + parts.join(', ') : '';
}

/** One entry per failed, interrupted or unrecorded scientific test, including case and repetition. */
export function diagramCampaignIssues(entry: DiagramLabArchiveEntry): string[] {
  const report = entry.report;
  const cases: { id: string; experiments: readonly unknown[] }[] = 'cases' in report
    ? report.cases.map((item) => ({ id: item.caseId, experiments: item.experiments }))
    : [{ id: 'essai libre', experiments: report.experiments }];
  const attempts = cases.flatMap((testCase) => testCase.experiments);
  const issues: string[] = [];
  const knownProfiles = new Map<string, { model: string; method: string }>();
  for (const testCase of cases) {
    for (const value of testCase.experiments) {
      const run = asRecord(value);
      const model = safeName(run.model ?? run.profileName);
      const method = safeName(run.method);
      const identity = String(run.profileId ?? run.profileName ?? model) + '\\u0000' + method;
      knownProfiles.set(identity, { model, method });
      const label = (testCase.id === 'essai libre' ? 'Essai libre' : 'Schéma ' + safeCase(testCase.id))
        + ' · répétition ' + (repetition(run.repetition) ?? '?')
        + ' · modèle ' + model + ' · méthode ' + method;
      if (run.status !== 'success') {
        issues.push(label + ' · ' + status(run.status) + ' · ' +
          cause(run.failureCategory ?? run.errorCategory) + diagnostics(run.diagnostics));
      } else if (run.scoreStatus === 'invalid-or-incomplete-proposal') {
        issues.push(label + ' · proposition de notation incomplète' + diagnostics(run.diagnostics));
      }
    }
  }

  // An interrupted campaign may have stopped between two repetitions or cases.
  // Infer missing slots ONLY from profiles actually seen in the archived runs.
  if (knownProfiles.size && repetition(report.plannedRepetitions)) {
    for (const testCase of cases) {
      for (const [key, profile] of knownProfiles) {
        const completed = new Set(testCase.experiments
          .map((value) => asRecord(value))
          .filter((run) => String(run.profileId ?? run.profileName ?? safeName(run.model)) +
            '\\u0000' + safeName(run.method) === key)
          .map((run) => repetition(run.repetition))
          .filter((n): n is number => n !== null));
        for (let index = 1; index <= report.plannedRepetitions; index++) {
          if (!completed.has(index)) issues.push(
            (testCase.id === 'essai libre' ? 'Essai libre' : 'Schéma ' + safeCase(testCase.id))
            + ' · répétition ' + index + ' · modèle ' + profile.model
            + ' · méthode ' + profile.method + (entry.state === 'running'
              ? ' · pas encore enregistrée (campagne en cours)' : ' · non enregistrée'));
        }
      }
    }
  }
  if (!attempts.length) {
    issues.push(entry.state === 'running'
      ? 'Aucun passage encore enregistré : campagne en cours.'
      : 'Aucun passage enregistré : campagne terminée sans résultat exploitable.');
  }
  return issues;
}

/** Successful requests with an absent grade are not successful biology results. */
export function biologyCampaignIssues(observations: readonly BiologyRadarObservation[]): string[] {
  return observations.flatMap((item) => {
    const gradeValid = item.status === 'success' && typeof item.score === 'number'
      && Number.isFinite(item.score) && item.score >= 0 && item.score <= 10;
    if (gradeValid) return [];
    const reason = item.status !== 'success' ? status(item.status) : 'note manquante ou invalide';
    return ['Copie synthétique ' + safeCase(item.caseId) + ' · modèle ' + safeName(item.model)
      + ' · protocole ' + safeName(item.protocol) + ' · méthode ' + safeName(item.method)
      + ' · ' + reason];
  });
}

/** Include failed configurations and configurations never reached, not raw logs. */
export function customCampaignIssues(record: ModelEvaluationRecord): string[] {
  const issues = record.results.filter((result) => result.status !== 'success').map((result) =>
    'Profil ' + safeName(record.configurations.find((c) => c.id === result.profileId)?.name) +
    ' · modèle ' + safeName(record.configurations.find((c) => c.id === result.profileId)?.analysisModel) +
    ' · étape ' + (record.stage === 'vision' ? 'lecture' : record.stage === 'analysis' ? 'analyse' : 'lecture + analyse') +
    ' · ' + status(result.status) + (result.status === 'failed' ? ' · ' + failureCategory(result.error) : ''));
  for (const configuration of record.configurations) {
    if (!record.results.some((result) => result.profileId === configuration.id)) {
      issues.push('Profil ' + safeName(configuration.name) + ' · modèle ' +
        safeName(record.stage === 'vision' ? configuration.visionModel : configuration.analysisModel) +
        ' · passage non enregistré');
    }
  }
  if (!record.results.length && !record.configurations.length) issues.push('Aucun passage enregistré pour ce test.');
  return issues;
}
