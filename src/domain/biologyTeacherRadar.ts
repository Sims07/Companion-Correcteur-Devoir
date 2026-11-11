import { buildPilotReport, type PilotRun } from './pilotEvaluationProtocol.ts';
import { buildQuestionContractReport, type QuestionContractRun } from './questionContractPilot.ts';
import { buildQuestionContractRepeatabilityReport, type QuestionContractRepeatabilityRun, type RepeatabilityCount, type RepeatabilitySuite } from './questionContractRepeatability.ts';

export type BiologyCorrectionProtocol = 'contract' | 'standard' | 'pilot';
export type BiologyRadarAxis = 'grade' | 'rubric' | 'positives' | 'negatives' | 'traps';
export const BIOLOGY_RADAR_AXES: readonly { id: BiologyRadarAxis; label: string; detail: string; weight: number }[] = [
  { id: 'grade', label: 'Justesse de la note', detail: 'Écart moyen avec la note de référence du professeur sur A/B/C, seulement si les dix sous-critères sont évalués.', weight: 40 },
  { id: 'rubric', label: 'Respect du barème', detail: 'Décisions identiques à celles du professeur pour les dix sous-critères de chaque copie A/B/C.', weight: 25 },
  { id: 'positives', label: 'Bonnes réponses reconnues', detail: 'Points attribués aux notions effectivement présentes dans les réponses A/B/C.', weight: 15 },
  { id: 'negatives', label: 'Erreurs détectées', detail: 'Points non attribués lorsque la réponse attendue est absente ou fausse dans A/B/C.', weight: 15 },
  { id: 'traps', label: 'Cas pièges', detail: 'Accord avec le barème sur D/E/F/G : négations, synonymes, contradictions et énoncé imprimé.', weight: 5 },
];

export interface BiologyRadarObservation {
  id: string;
  profileId: string;
  profile: string;
  model: string;
  provider: string;
  method: string;
  protocol: BiologyCorrectionProtocol;
  caseId: string;
  recordedAt: string;
  status: string;
  score: number | null;
  referenceScore: number;
  decisions: { id: string; expected: 0 | 1; awarded: number | null }[];
}

const STORAGE_KEY = 'companion:biology-teacher-radar:v1';
const BASELINE_IDS = ['A', 'B', 'C'] as const;
const STRESS_IDS = ['D', 'E', 'F', 'G'] as const;

function makeObservation(input: Omit<BiologyRadarObservation, 'id'>, identity: string): BiologyRadarObservation {
  return { ...input, id: [identity, input.profileId, input.model, input.provider, input.method, input.protocol, input.caseId, input.recordedAt].join('|') };
}
function decisionsFrom(benchmark: { subcriteria: readonly { id: string; expected: 0 | 1; awarded: number | null }[] } | null) {
  return benchmark?.subcriteria.map((item) => ({ id: item.id, expected: item.expected, awarded: item.awarded })) ?? [];
}

/** Persist summaries, never photos, prompts, student transcriptions or provider URLs. */
export function biologyRadarObservations(
  pilotRuns: readonly PilotRun[],
  contractRuns: readonly QuestionContractRun[],
  repeatabilityRuns: readonly QuestionContractRepeatabilityRun[],
  repetitions: RepeatabilityCount,
  suite: RepeatabilitySuite,
): BiologyRadarObservation[] {
  const pilot = buildPilotReport(pilotRuns, '');
  const contract = buildQuestionContractReport(contractRuns, '');
  const repeatability = buildQuestionContractRepeatabilityReport(repeatabilityRuns, '', repetitions, suite);
  const fromPilot = pilot.experiments.flatMap((experiment) => experiment.modelResults
    .filter((result) => experiment.stage !== 'vision' && result.benchmark !== null)
    .map((result) => makeObservation({
      profileId: result.profile, profile: result.profile, model: result.analysisModel,
      provider: result.provider, method: result.method, protocol: 'pilot',
      caseId: experiment.caseId, recordedAt: experiment.completedAt, status: result.status,
      score: result.score, referenceScore: experiment.modelResults.find((item) => item.profile === result.profile)?.referenceScore ?? 0,
      decisions: decisionsFrom(result.benchmark),
    }, 'pilot:' + experiment.stage)));
  const fromContract = contract.experiments.map((experiment) => makeObservation({
    profileId: experiment.profileId, profile: experiment.profile, model: experiment.analysisModel,
    provider: experiment.provider, method: experiment.method, protocol: experiment.variant,
    caseId: experiment.caseId, recordedAt: experiment.completedAt, status: experiment.status,
    score: experiment.score, referenceScore: experiment.referenceScore,
    decisions: decisionsFrom(experiment.benchmark),
  }, 'question-contract'));
  const fromRepeated = repeatability.experiments.map((experiment) => makeObservation({
    profileId: experiment.profileId, profile: experiment.profile, model: experiment.analysisModel,
    provider: experiment.provider, method: experiment.method, protocol: 'contract',
    caseId: experiment.caseId, recordedAt: experiment.completedAt, status: experiment.status,
    score: experiment.score, referenceScore: experiment.referenceScore,
    decisions: decisionsFrom(experiment.benchmark),
  }, 'repeatability:' + repeatability.suite + ':' + experiment.repetition));
  return [...fromPilot, ...fromContract, ...fromRepeated].filter((item) => item.model.trim().length > 0);
}

export function mergeBiologyRadarHistory(previous: readonly BiologyRadarObservation[], additions: readonly BiologyRadarObservation[]) {
  const entries = new Map(previous.map((item) => [item.id, item]));
  for (const item of additions) entries.set(item.id, item);
  return [...entries.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 1200);
}

export function loadBiologyRadarHistory(): BiologyRadarObservation[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is BiologyRadarObservation =>
      !!entry && typeof entry === 'object' && typeof entry.id === 'string' &&
      typeof entry.profileId === 'string' && typeof entry.model === 'string' &&
      typeof entry.caseId === 'string' && typeof entry.recordedAt === 'string' &&
      ['pilot', 'contract', 'standard'].includes(entry.protocol) &&
      Array.isArray(entry.decisions) && typeof entry.referenceScore === 'number' &&
      (entry.score === null || (typeof entry.score === 'number' && Number.isFinite(entry.score))));
  } catch { return []; }
}

export function saveBiologyRadarHistory(history: readonly BiologyRadarObservation[]): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); }
  catch { /* Storage might be unavailable or full; the current session still works. */ }
}

export interface BiologyRadarCandidate {
  id: string;
  name: string;
  provider: string;
  method: string;
  protocol: BiologyCorrectionProtocol;
  axes: Record<BiologyRadarAxis, number | null>;
  measured: number;
  score: number | null;
  partialScore: number | null;
  gradeDifference: number | null;
  observations: BiologyRadarObservation[];
}

// An undecidable criterion is not a teacher-verified zero: only fully resolved cases enter an axis.
const valid = (item: BiologyRadarObservation) => item.status === 'success' &&
  item.decisions.length === 10 && item.decisions.every((d) =>
    d && typeof d.id === 'string' && (d.expected === 0 || d.expected === 1) &&
    typeof d.awarded === 'number' && Number.isFinite(d.awarded) && d.awarded >= 0 && d.awarded <= 1);

const round = (n: number) => Math.round(n * 10) / 10;
const accuracy = (items: BiologyRadarObservation[]) => {
  const decisions = items.flatMap((item) => item.decisions);
  return round(100 * decisions.filter((d) => d.awarded !== null && Math.abs(d.awarded - d.expected) < 0.001).length / decisions.length);
};
const axisFraction = (items: BiologyRadarObservation[], expected: 0 | 1) => {
  const decisions = items.flatMap((item) => item.decisions).filter((d) => d.expected === expected);
  return decisions.length
    ? round(100 * decisions.filter((d) => d.awarded !== null && Math.abs(d.awarded - expected) < 0.001).length / decisions.length)
    : null;
};

/** Compare only like-for-like protocols and fully completed, teacher-keyed case sets. */
export function buildBiologyRadar(history: readonly BiologyRadarObservation[], protocol: BiologyCorrectionProtocol): BiologyRadarCandidate[] {
  const groups = new Map<string, BiologyRadarObservation[]>();
  for (const item of history) {
    if (item.protocol !== protocol || !item.model.trim()) continue;
    const key = [item.provider, item.method, item.model].join('::');
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const result = [...groups.entries()].map(([id, group]) => {
    const newest = [...group].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    const latestByCase = new Map<string, BiologyRadarObservation>();
    for (const entry of newest) {
      if (!latestByCase.has(entry.caseId) && valid(entry)) latestByCase.set(entry.caseId, entry);
    }
    const baseline = BASELINE_IDS.map((caseId) => latestByCase.get(caseId)).filter((item): item is BiologyRadarObservation => !!item);
    const traps = STRESS_IDS.map((caseId) => latestByCase.get(caseId)).filter((item): item is BiologyRadarObservation => !!item);
    const ready = baseline.length === BASELINE_IDS.length;
    const grades = ready && baseline.every((item) => item.score !== null &&
      item.decisions.every((decision) => decision.awarded !== null) &&
      item.score! >= 0 && item.score! <= 10);
    const gradeDifference = grades
      ? round(baseline.reduce((sum, item) => sum + Math.abs(item.score! - item.referenceScore), 0) / baseline.length)
      : null;
    const axes: Record<BiologyRadarAxis, number | null> = {
      grade: gradeDifference === null ? null : round(100 * (1 - gradeDifference / 10)),
      rubric: ready ? accuracy(baseline) : null,
      positives: ready ? axisFraction(baseline, 1) : null,
      negatives: ready ? axisFraction(baseline, 0) : null,
      traps: traps.length === STRESS_IDS.length ? accuracy(traps) : null,
    };
    const available = BIOLOGY_RADAR_AXES.filter((axis) => axes[axis.id] !== null);
    const weighted = available.reduce((sum, axis) => sum + axes[axis.id]! * axis.weight, 0);
    const weightSum = available.reduce((sum, axis) => sum + axis.weight, 0);
    const complete = available.length === BIOLOGY_RADAR_AXES.length;
    return {
      id, name: newest[0]!.model, provider: newest[0]!.provider, method: newest[0]!.method,
      protocol, axes, measured: available.length, score: complete ? round(weighted / weightSum) : null,
      partialScore: weightSum ? round(weighted / weightSum) : null,
      gradeDifference,
      observations: [...latestByCase.values()],
    };
  });
  return result.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name));
}
