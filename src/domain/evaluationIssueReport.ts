import type { BiologyRadarObservation } from './biologyTeacherRadar.ts';

type ReportObservation = Pick<BiologyRadarObservation,
  'caseId' | 'recordedAt' | 'status' | 'score' | 'decisions' | 'model' | 'protocol' | 'method'>;

export interface EvaluationIssueReportInput {
  journey: 'biology' | 'diagrams' | 'custom';
  status: string;
  model?: string;
  campaignId?: string;
  message?: string;
  observations?: readonly ReportObservation[];
  stats?: { successful: number; total: number };
  generatedAt?: string;
}

/** Zero is a valid grade; only failed runs and absent/invalid grades are missing. */
export function countedUsableBiologyGrades(observations: readonly Pick<BiologyRadarObservation, 'status' | 'score'>[]): number {
  return observations.filter((o) => o.status === 'success' &&
    typeof o.score === 'number' && Number.isFinite(o.score) && o.score >= 0 && o.score <= 10).length;
}

function identifier(value: string | undefined): string {
  const name = value?.trim() ?? '';
  return name.length > 0 && name.length <= 100 &&
    !name.includes('//') && !/https?:/i.test(name) &&
    /^[A-Za-zÀ-ÿ0-9 ._,:+/·-]+$/.test(name) ? name : 'non communiqué';
}

function simpleId(value: string | undefined): string {
  return value && /^[A-Za-z0-9:_-]{1,100}$/.test(value) ? value : 'non communiqué';
}

function caseId(value: string): string {
  return /^[A-Za-z0-9_-]{1,12}$/.test(value) ? value : 'non communiqué';
}

function status(value: string): string {
  const known: Record<string, string> = {
    success: 'réussi', failed: 'échec', error: 'échec', cancelled: 'interrompu',
    running: 'en cours', completed: 'terminé', 'Terminée': 'terminée',
    'Incomplète': 'incomplète', 'Résultats partiels': 'résultats partiels',
  };
  return known[value] ?? 'non déterminé';
}

/** Never include raw provider errors: they may contain URLs, responses or student content. */
function failureCategory(message?: string): string {
  if (!message) return 'Non précisé';
  if (/aucun résultat exploitable/i.test(message)) return 'Aucun résultat exploitable';
  if (/aucune décision scientifique exploitable/i.test(message)) return 'Aucune décision scientifique exploitable';
  if (/aucun passage scientifique enregistré/i.test(message)) return 'Aucun passage enregistré';
  if (/\bJSON\b|parsing|parse error/i.test(message)) return 'Réponse JSON non exploitable';
  if (/timeout|délai dépassé|expiration/i.test(message)) return 'Délai dépassé';
  if (/\bHTTP\s*[45][0-9]{2}\b/i.test(message)) return 'Erreur HTTP';
  if (/interrompu|arrêt demandé/i.test(message)) return 'Exécution interrompue';
  if (/passages réussis/i.test(message)) return 'Certains passages ont échoué';
  return 'Échec de traitement (détails bruts non inclus)';
}

/** Local, explicit sharing only. No copy, transcription, rubric, prompt, URL or raw LLM response. */
export function buildEvaluationIssueReport(input: EvaluationIssueReportInput): string {
  const observations = input.observations ?? [];
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const parsedDate = Date.parse(generatedAt);
  const domain = input.journey === 'biology' ? 'Biologie'
    : input.journey === 'diagrams' ? 'Schémas scientifiques' : 'Évaluation sur copie';
  const lines = [
    'Compagnon Correcteur — rapport de problème d’évaluation',
    'Date : ' + (Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : 'inconnue'),
    'Domaine : ' + domain,
    'État : ' + status(input.status),
    'Modèle : ' + identifier(input.model),
    'Campagne : ' + simpleId(input.campaignId),
    'Type de problème : ' + failureCategory(input.message),
  ];
  if (input.stats) {
    lines.push('Résultats exploitables : ' + input.stats.successful + '/' + input.stats.total);
  }
  if (observations.length) {
    lines.push('Notes exploitables : ' + countedUsableBiologyGrades(observations) + '/' + observations.length);
    lines.push('Passages enregistrés (30 derniers au maximum) :');
    for (const observation of observations.slice(-30)) {
      const score = typeof observation.score === 'number' && Number.isFinite(observation.score)
        ? String(observation.score) + '/10' : 'absente';
      const decided = observation.decisions.filter((decision) =>
        typeof decision.awarded === 'number' && Number.isFinite(decision.awarded)).length;
      lines.push('- ' + caseId(observation.caseId) +
        ' · ' + status(observation.status) +
        ' · note : ' + score +
        ' · décisions : ' + decided + '/' + observation.decisions.length +
        ' · protocole : ' + identifier(observation.protocol) +
        ' · méthode : ' + identifier(observation.method) +
        ' · modèle : ' + identifier(observation.model));
    }
  }
  lines.push('', 'Rapport généré localement. Aucun contenu de copie, identité, réponse, prompt, barème, URL ou erreur brute inclus.');
  return lines.join('\n');
}
