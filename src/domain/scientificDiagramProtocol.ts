import type { AiModelProfile } from './aiModelProfiles.ts';
import type { ModelEvaluationRecord, ModelEvaluationResultSnapshot } from './modelEvaluation.ts';
import { getRubricSubcriteria, validateRubric, type Rubric } from './rubric.ts';
import { isVisualDecisionModel } from './systemOneDecision.ts';
import { extractSystemOneDecisions, type VisualChoice } from './visualDecisionEvaluation.ts';
import { isSupportedPilotProfile, isLoopbackPilotEndpoint } from './pilotEvaluationProtocol.ts';

export const SCIENTIFIC_DIAGRAM_PROTOCOL_ID = 'scientific-diagram-observable-v1';

/** Faithful copy of the professor's observable dimensions. The 2-point
 * "Compréhension" criterion is excluded until diagram-specific expectations
 * have been supplied; we must never invent a biological answer key. */
export const SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC: Rubric = {
  title: 'Dessin scientifique — critères observables (8 points)',
  criteria: [
    {
      id: 'drawing', title: 'Qualité du dessin', description: '', maxPoints: 4,
      analysisMode: 'scientific-diagram',
      subcriteria: [
        { id: 'drawing-page', title: 'Occupe toute la page', description: '', maxPoints: 0.66 },
        { id: 'drawing-centered', title: 'Centré', description: '', maxPoints: 0.66 },
        { id: 'drawing-lines', title: 'Traits fins, continus, précis de même épaisseur', description: '', maxPoints: 0.66 },
        { id: 'drawing-clean', title: 'Impression générale Propre', description: '', maxPoints: 0.66 },
        { id: 'drawing-proportions', title: 'Fidèle à la réalité (Proportions respectées)', description: '', maxPoints: 0.66 },
        { id: 'drawing-neighbors', title: 'Départ des cellules voisines indiqué', description: '', maxPoints: 0.7 },
      ],
    },
    {
      id: 'title', title: 'Titre', description: '', maxPoints: 2,
      analysisMode: 'scientific-diagram',
      subcriteria: [
        { id: 'title-below', title: 'Placé en dessous', description: '', maxPoints: 0.33 },
        { id: 'title-centered', title: 'centré', description: '', maxPoints: 0.33 },
        { id: 'title-emphasis', title: 'Souligné ou encadré ou en majuscule', description: '', maxPoints: 0.33 },
        { id: 'title-horizontal', title: 'Ecriture horizontale', description: '', maxPoints: 0.33 },
        { id: 'title-subject', title: 'Sujet entièrement précisé ( type de cellule, organe, organisme)', description: '', maxPoints: 0.33 },
        { id: 'title-section', title: 'Indique s\'il y a une coupe réalisée', description: '', maxPoints: 0.35 },
      ],
    },
    {
      id: 'legends', title: 'légendes', description: '', maxPoints: 2,
      analysisMode: 'scientific-diagram',
      subcriteria: [
        { id: 'legends-horizontal', title: 'Ecriture horizontale', description: '', maxPoints: 0.66 },
        { id: 'legends-aligned', title: 'Alignées en colonne', description: '', maxPoints: 0.66 },
        { id: 'legends-visible', title: 'Ne mentionnent que des structures visibles', description: '', maxPoints: 0.68 },
      ],
    },
  ],
};

export type DiagramTeacherDecision = 'present' | 'absent' | 'partial';
export type DiagramGold = Record<string, DiagramTeacherDecision>;
export type DiagramProtocolRun = { repetition: number; record: ModelEvaluationRecord };
export type DiagramProtocolCount = 1 | 3 | 5;

export function diagramTargetKey(criterionId: string, subcriterionId: string): string {
  return criterionId + '::' + subcriterionId;
}

/** Imports the application's JSON rubric format, with no model-generated changes.
 * All dimensions must be explicit and independently measurable in this lab.
 * Legacy "Compréhension" prose without measurable subcriteria is omitted. */
export function parseScientificDiagramProtocolRubric(value: unknown): Rubric {
  const document = asObject(value, 'Le JSON doit contenir un objet barème.');
  const source = document.rubric === undefined ? document : asObject(document.rubric, 'Barème invalide.');
  if (!Array.isArray(source.criteria)) throw new Error('Le barème doit contenir une liste de critères.');
  const criteria = source.criteria.map((entry) => {
    const criterion = asObject(entry, 'Critère invalide.');
    if (criterion.subcriteria !== undefined && !Array.isArray(criterion.subcriteria)) throw new Error('Les sous-critères doivent former une liste.');
    const subcriteria = (criterion.subcriteria ?? []).map((child: unknown) => {
      const sub = asObject(child, 'Sous-critère invalide.');
      return {
        id: checkedString(sub.id, 'Identifiant de sous-critère'),
        title: checkedString(sub.title, 'Titre de sous-critère'),
        description: typeof sub.description === 'string' ? sub.description : '',
        maxPoints: checkedPoints(sub.maxPoints),
      };
    });
    return {
      id: checkedString(criterion.id, 'Identifiant de critère'),
      title: checkedString(criterion.title, 'Titre de critère'),
      description: typeof criterion.description === 'string' ? criterion.description : '',
      maxPoints: checkedPoints(criterion.maxPoints),
      analysisMode: 'scientific-diagram' as const,
      subcriteria,
    };
  }).filter((criterion) => criterion.subcriteria.length > 0 ||
    !/compr[eé]hension/i.test(criterion.title));
  if (criteria.some((criterion) => criterion.subcriteria.length === 0)) {
    throw new Error('Définissez des sous-critères mesurables pour chaque critère du schéma.');
  }
  const rubric: Rubric = {
    title: typeof source.title === 'string' ? source.title :
      typeof source.rubricTitle === 'string' ? source.rubricTitle : 'Barème de dessin scientifique',
    criteria,
  };
  const validation = validateRubric(rubric);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  return rubric;
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}
function checkedString(value: unknown, title: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(title + ' manquant.');
  return value;
}
function checkedPoints(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Les points doivent être des nombres positifs ou nuls.');
  return value;
}

export function diagramProtocolProfileIssue(profile: AiModelProfile): string | null {
  if (!isSupportedPilotProfile(profile)) return 'Adresse de serveur invalide : ' + profile.name;
  const config = profile.configuration;
  if (!config.analysisModel.trim()) return 'Modèle d’analyse manquant : ' + profile.name;
  if (config.correctionMethod === 'decision' && config.apiCompatible) {
    return 'System One ne passe pas par l’API Chat compatible OpenAI : ' + profile.name;
  }
  if (!usesDirectDiagramVision(profile) && !config.visionModel.trim()) {
    return 'Modèle Vision manquant pour le parcours en deux étapes : ' + profile.name;
  }
  return null;
}

export function usesDirectDiagramVision(profile: AiModelProfile): boolean {
  return !profile.configuration.apiCompatible && profile.configuration.correctionMethod === 'decision'
    && isVisualDecisionModel(profile.configuration.analysisModel);
}

export function diagramObservations(result: ModelEvaluationResultSnapshot, rubric: Rubric) {
  const source = result.directVisualDecision ? 'image' : 'text';
  const native = new Map(extractSystemOneDecisions(result, rubric, source).map((observation) =>
    [diagramTargetKey(observation.criterionId, observation.targetId), observation]));
  return rubric.criteria.flatMap((criterion) => getRubricSubcriteria(criterion).map((sub) => {
    const key = diagramTargetKey(criterion.id, sub.id);
    const observed = native.get(key);
    const proposal = result.proposal?.criteria.find((item) => item.criterionId === criterion.id);
    const assessment = proposal?.subcriteria?.find((item) => item.subcriterionId === sub.id);
    let choice: VisualChoice = 'uncertain';
    let decisionSource: 'native-image' | 'native-text' | 'scored-proposal' | 'none' = 'none';
    if (result.status === 'success') {
      if (observed) {
        // The native decision is observable independently from score validity.
        // In particular, missing literal evidence must not erase TEV1 choices.
        choice = observed.choice;
        decisionSource = source === 'image' ? 'native-image' : 'native-text';
      } else if (proposal && proposal.assessmentStatus !== 'not-evaluated' && assessment
        && assessment.assessmentStatus !== 'not-evaluated' && Number.isFinite(assessment.points)
        && assessment.points >= 0 && assessment.points <= sub.maxPoints) {
        choice = assessment.points === 0 ? 'absent'
          : Math.abs(assessment.points - sub.maxPoints) < 0.0001 ? 'present' : 'partial';
        decisionSource = 'scored-proposal';
      }
    }
    return {
      key, criterion: criterion.title, title: sub.title, choice, decisionSource,
      probability: decisionSource === 'native-image' || decisionSource === 'native-text'
        ? observed?.probability ?? null : null,
    };
  }));
}

/** Only export a fixed failure category: original errors may contain URLs,
 * identifiers, network payloads or credentials from a provider exception. */
export function diagramFailureCategory(error?: string): 'model-unavailable' | 'connection' | 'system-one-unavailable' | 'other' | null {
  if (!error) return null;
  if (/n.est pas install.|not installed|unknown model|model not found|ollama pull/i.test(error)) return 'model-unavailable';
  if (/injoignable|failed to fetch|networkerror|econnrefused|cors|connection refused/i.test(error)) return 'connection';
  if (/system one|systemone/i.test(error)) return 'system-one-unavailable';
  return 'other';
}

/** A report only contains authored rubric, decisions and timings. No images,
 * copied responses, API endpoints, credentials, prompts or raw model messages. */
export function buildScientificDiagramProtocolReport(
  runs: readonly DiagramProtocolRun[], rubric: Rubric, gold: DiagramGold,
  plannedRepetitions: DiagramProtocolCount, createdAt: string, imageCount: number,
) {
  const totalTargets = rubric.criteria.reduce((sum, criterion) => sum + getRubricSubcriteria(criterion).length, 0);
  const profiles = [...new Set(runs.flatMap(({ record }) => record.results.map((result) => result.profileId)))];
  const experiments = runs.flatMap(({ repetition, record }) => record.results.map((result) => ({
    repetition, profileId: result.profileId, profileName: result.profileName,
    model: record.configurations.find((entry) => entry.id === result.profileId)?.analysisModel ?? '',
    method: result.directVisualDecision ? 'direct-image-systemone' as const : 'vision-then-analysis' as const,
    status: result.status,
    failureCategory: result.status !== 'success' ? diagramFailureCategory(result.error) : null,
    error: result.error
      ? result.readingMs === 0 && result.analysisMs === 0
        ? 'Échec avant traitement du schéma : vérifiez la configuration ou les modèles dans l’observabilité locale.'
        : 'Échec durant le traitement : détails dans l’observabilité locale.'
      : null,
    durationMs: result.elapsedMs, readingMs: result.readingMs, analysisMs: result.analysisMs,
    tokens: result.tokens, score: result.score,
    scoreStatus: result.status !== 'success' ? 'execution-failed' as const
      : result.score !== null ? 'scored' as const
      : result.proposal ? 'teacher-review-required' as const : 'invalid-or-incomplete-proposal' as const,
    observations: diagramObservations(result, rubric),
  })));
  const summaries = profiles.map((profileId) => {
    const items = experiments.filter((item) => item.profileId === profileId).sort((a, b) => a.repetition - b.repetition);
    const ids = items[0]?.observations.map((item) => item.key) ?? [];
    const decisions = ids.map((key) => {
      const choices = items.map((item) => item.observations.find((entry) => entry.key === key)?.choice ?? 'uncertain');
      const resolved = choices.filter((choice) => choice !== 'uncertain');
      const known = gold[key] ?? null;
      return {
        key, reference: known, choices,
        stable: plannedRepetitions > 1 && items.length === plannedRepetitions
          && choices.every((choice) => choice === choices[0]),
        stableAndResolved: items.length === plannedRepetitions && resolved.length === items.length && new Set(choices).size === 1,
        correctEveryTime: Boolean(known) && items.length === plannedRepetitions && choices.every((choice) => choice === known),
      };
    });
    const labelled = decisions.filter((item) => item.reference !== null);
    const totalLabelledObservations = labelled.length * items.length;
    const correct = labelled.reduce((sum, decision) => sum +
      decision.choices.filter((choice) => choice === decision.reference).length, 0);
    const resolved = decisions.reduce((sum, decision) => sum +
      decision.choices.filter((choice) => choice !== 'uncertain').length, 0);
    const complete = items.length === plannedRepetitions && items.every((item) => item.status === 'success');
    const anyResolved = resolved > 0;
    return {
      profileId, profileName: items[0]?.profileName ?? profileId, model: items[0]?.model ?? '',
      method: items[0]?.method ?? 'vision-then-analysis',
      runsCompleted: items.length, plannedRepetitions,
      successfulRuns: items.filter((item) => item.status === 'success').length,
      scoredRuns: items.filter((item) => item.scoreStatus === 'scored').length,
      unscoredRuns: items.filter((item) =>
        item.scoreStatus === 'teacher-review-required'
        || item.scoreStatus === 'invalid-or-incomplete-proposal').length,
      failedRuns: items.filter((item) => item.scoreStatus === 'execution-failed').length,
      resolvedDecisions: resolved, totalDecisions: items.length * ids.length,
      complete,
      meanDurationMs: items.length ? Math.round(items.reduce((sum, item) => sum + item.durationMs, 0) / items.length) : null,
      labelledTargets: labelled.length, totalTargets,
      // Zero recovered answers is a technical/no-coverage state, NOT evidence
      // that the model is wrong on every rubric item.
      accuracyPercent: totalLabelledObservations && anyResolved
        ? Math.round(1000 * correct / totalLabelledObservations) / 10 : null,
      coveragePercent: items.length && ids.length ? Math.round(1000 * resolved / (items.length * ids.length)) / 10 : null,
      stableResolvedTargets: complete && plannedRepetitions > 1 ? decisions.filter((item) => item.stableAndResolved).length : null,
      correctEveryTime: complete && plannedRepetitions > 1 && labelled.length ? decisions.filter((item) => item.correctEveryTime).length : null,
      decisions,
    };
  });
  return {
    format: 'companion-scientific-diagram-protocol', version: 1,
    protocolId: SCIENTIFIC_DIAGRAM_PROTOCOL_ID, createdAt, plannedRepetitions,
    localOnly: runs.every(({ record }) => record.configurations.every((configuration) => isLoopbackPilotEndpoint(configuration.endpoint))),
    rubric: structuredClone(rubric), imageCount, gold: structuredClone(gold),
    limitations: 'Un seul schéma et la même image par répétition. Aucune décision récupérée signifie « justesse non mesurée », pas 0 % d’exactitude. Une réponse indécidable pénalise la justesse stricte dès lors que des décisions sont récupérées, mais ne prouve pas une erreur de fond. Les choix System One sur transcription (TEV1) sont provisoires : mise en page, centrage et traits exigent la photographie. Une note nulle (null) indique un besoin de revue, jamais un zéro attribué. Répétabilité ne prouve pas exactitude. Les probabilités ne sont pas calibrées.',
    summaries, experiments,
  };
}
