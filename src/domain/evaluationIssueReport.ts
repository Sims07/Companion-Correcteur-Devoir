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
  if (value && /^[A-Za-z0-9:_-]{1,100}$/.test(value)) return value;
  // Exact scientific archive format, not arbitrary user-supplied identifiers.
  if (value && /^companion-scientific-diagram-[a-z-]+:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return value;
  return 'non communiqué';
}

function caseId(value: string): string {
  return /^[A-Za-z0-9_-]{1,12}$/.test(value) ? value : 'non communiqué';
}

function status(value: string): string {
  const known: Record<string, string> = {
    success: 'réussi', failed: 'échec', error: 'échec', cancelled: 'interrompu',
    partial: 'résultats partiels', running: 'en cours', completed: 'terminé', 'Terminée': 'terminée',
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
  if (/Modèle décisionnel utilisé en Vision|ne prend pas en charge le chat/i.test(message)) return 'Modèle décisionnel incompatible avec la lecture Vision';
  if (/API System One indisponible|API System One refusée/i.test(message)) return 'API System One indisponible ou incompatible';
  if (/Modèle absent sur le serveur Ollama/i.test(message)) return 'Modèle non installé';
  if (/Connexion au serveur impossible|Erreur réseau/i.test(message)) return 'Connexion au serveur impossible';
  if (/Réponse du modèle incomplète ou invalide|Observation visuelle invalide/i.test(message)) return 'Résultat IA invalide';
  if (/\bJSON\b|parsing|parse error/i.test(message)) return 'Réponse JSON non exploitable';
  if (/timeout|délai dépassé|expiration/i.test(message)) return 'Délai dépassé';
  if (/\bHTTP\s*[45][0-9]{2}\b/i.test(message)) return 'Erreur HTTP';
  // An unsuccessful batch may mention "échoués ou interrompus" without
  // the teacher ever cancelling it. Never mistake that for a real stop.
  if (/passages réussis|essais échoués/i.test(message)) return 'Certains passages ont échoué';
  if (/interrompu|arrêt demandé/i.test(message)) return 'Exécution interrompue';
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
    'Type de problème : ' + (input.journey === 'biology' && (input.status === 'partial' || input.status === 'Résultats partiels')
      ? 'Notes partiellement disponibles' : failureCategory(input.message)),
  ];
  if (input.stats) {
    lines.push('Résultats exploitables : ' + input.stats.successful + '/' + input.stats.total);
  } else if (input.journey === 'diagrams') {
    // Copy only bounded numeric counters from the generated failure summary.
    const counts = input.message?.match(/^(\d{1,5})\/(\d{1,5}) passages réussis\./);
    if (counts && Number(counts[1]) <= Number(counts[2])) {
      lines.push('Passages scientifiques réussis : ' + counts[1] + '/' + counts[2]);
    }
  }
  if (observations.length) {
    lines.push('Notes exploitables : ' + countedUsableBiologyGrades(observations) + '/' + observations.length);
    lines.push('Passages enregistrés (30 derniers au maximum) :');
    for (const observation of observations.slice(-30)) {
      const score = typeof observation.score === 'number' && Number.isFinite(observation.score)
        ? String(observation.score) + '/10' : 'absente';
      const decided = observation.decisions.filter((decision) =>
        typeof decision.awarded === 'number' && Number.isFinite(decision.awarded)).length;
      const unresolved = observation.decisions.filter((d) => d.awarded === null && /^p(?:[1-9]|10)$/.test(d.id)).map((d) => d.id);
      lines.push('- ' + caseId(observation.caseId) +
        ' · ' + status(observation.status) +
        ' · note : ' + score +
        ' · décisions : ' + decided + '/' + observation.decisions.length +
        (unresolved.length ? ' · indéterminés : ' + unresolved.join(', ') : '') +
        ' · protocole : ' + identifier(observation.protocol) +
        ' · méthode : ' + identifier(observation.method) +
        ' · modèle : ' + identifier(observation.model));
    }
  }
  lines.push('', 'Rapport généré localement. Aucun contenu de copie, identité, réponse, prompt, barème, URL ou erreur brute inclus.');
  return lines.join('\n');
}
