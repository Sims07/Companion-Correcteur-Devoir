import { SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET } from './scientificDiagramFixtures.ts';
import { DIAGRAM_SENSITIVITY_CASES, DIAGRAM_SENSITIVITY_TARGETS } from './scientificDiagramSensitivity.ts';
import type { DiagramLabArchiveEntry, DiagramLabProtocol } from './diagramLabHistory.ts';

export const RADAR_AXES = [
  { id: 'graphics', label: 'Qualité graphique', short: 'Graphisme', detail: 'Accord des décisions visuelles avec les références A/B/C.' },
  { id: 'arrows', label: 'Sens des flèches', short: 'Flèches', detail: 'Correspondances exactes sur la paire témoin D et piège E.' },
  { id: 'biology', label: 'Cohérence biologique', short: 'Biologie', detail: 'Mutations S1/S2/S3 détectées après observation correcte du témoin S0.' },
  { id: 'relations', label: 'Lecture des relations', short: 'Relations', detail: 'Extraction indépendante : mutations reconnues et relations correctes préservées.' },
  { id: 'robustness', label: 'Robustesse aux pièges', short: 'Robustesse', detail: 'Absence de faux rejets sur les relations valides et de faux positifs sur les témoins.' },
  { id: 'stability', label: 'Stabilité', short: 'Stabilité', detail: 'Décisions identiques et déterminées sur au moins trois passages du même dessin.' },
  { id: 'coverage', label: 'Couverture', short: 'Couverture', detail: 'Part des décisions déterminées parmi les attendus mesurables des batteries complètes.' },
  { id: 'speed', label: 'Performance', short: 'Vitesse', detail: 'Durée moyenne par dessin, y compris les appels supplémentaires de la méthode ; 60 s correspondent à 50/100.' },
] as const;

export type RadarAxisId = typeof RADAR_AXES[number]['id'];
export type RadarWeights = Record<RadarAxisId, number>;
export type RadarGrouping = 'profile' | 'method';

export const RADAR_PRESETS = {
  scientific: { graphics: 1, arrows: 3, biology: 3, relations: 3, robustness: 3, stability: 2, coverage: 1, speed: 1 },
  balanced: { graphics: 1, arrows: 1, biology: 1, relations: 1, robustness: 1, stability: 1, coverage: 1, speed: 1 },
  throughput: { graphics: 1, arrows: 2, biology: 2, relations: 2, robustness: 2, stability: 1, coverage: 2, speed: 3 },
} as const satisfies Record<string, RadarWeights>;

export interface RadarEvidence {
  reportId: string;
  protocol: DiagramLabProtocol;
  createdAt: string;
  detail: string;
  observed: number;
  total: number;
}
export interface RadarAxisScore {
  value: number | null;
  reason: string;
  evidence: RadarEvidence[];
}
export interface RadarCandidate {
  id: string;
  profileId: string;
  name: string;
  methods: string[];
  models: string[];
  axes: Record<RadarAxisId, RadarAxisScore>;
  measured: number;
  complete: boolean;
  updatedAt: string;
}
export interface RadarRankedCandidate extends RadarCandidate {
  weightedScore: number | null;
}

/** One row corresponds to a single drawing, repetition, profile and algorithm. */
interface Reading {
  profileId: string;
  profileName: string;
  model: string;
  method: string;
  variant: string;
  caseId: string;
  repetition: number;
  status: string;
  durationMs: number;
  observations: Record<string, string>;
}
interface Battery {
  entry: DiagramLabArchiveEntry;
  readings: Reading[];
}
interface CandidateDraft {
  id: string;
  profileId: string;
  name: string;
  methods: Set<string>;
  models: Set<string>;
  updatedAt: string;
  batteries: Map<DiagramLabProtocol, Battery>;
}
interface Fraction {
  n: number;
  d: number;
  label: string;
}
const scienceKeys = Object.values(DIAGRAM_SENSITIVITY_TARGETS);

function limited(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}
function percent(n: number, d: number): number | null {
  return d > 0 && Number.isFinite(n) && Number.isFinite(d) ? limited(100 * n / d) : null;
}
function empty(reason: string): RadarAxisScore {
  return { value: null, reason, evidence: [] };
}
function evidence(battery: Battery, label: string, n: number, d: number): RadarEvidence {
  return { reportId: battery.entry.id, protocol: battery.entry.protocol, createdAt: battery.entry.createdAt,
    detail: label, observed: n, total: d };
}
function fromFraction(battery: Battery | null, label: string, fraction: Fraction | null, reason: string): RadarAxisScore {
  if (!battery || !fraction || !fraction.d) return empty(reason);
  return { value: percent(fraction.n, fraction.d), reason: label,
    evidence: [evidence(battery, label, fraction.n, fraction.d)] };
}

function flatten(entry: DiagramLabArchiveEntry): Reading[] {
  const report = entry.report;
  if (report.format === 'companion-scientific-diagram-protocol') return [];
  if (report.format === 'companion-scientific-diagram-blind-graph-report') {
    return report.cases.flatMap((testCase) => testCase.experiments.map((run) => ({
      profileId: run.profileId, profileName: run.profileName, model: run.model,
      method: run.zoom ? 'blind-graph-zoom' : 'blind-graph',
      variant: report.promptVariant, caseId: testCase.caseId, repetition: run.repetition,
      status: run.status, durationMs: run.durationMs, observations: { ...run.observations },
    })));
  }
  if (report.format === 'companion-scientific-diagram-sensitivity-report') {
    return report.cases.flatMap((testCase) => testCase.experiments.map((run) => ({
      profileId: run.profileId, profileName: run.profileName, model: run.model,
      method: run.method, variant: testCase.promptMode, caseId: testCase.caseId,
      repetition: run.repetition, status: run.status, durationMs: run.durationMs,
      observations: Object.fromEntries(run.observations.map((item) => [item.key, item.choice])),
    })));
  }
  return report.cases.flatMap((testCase) => testCase.experiments.map((run) => ({
    profileId: run.profileId, profileName: run.profileName, model: run.model,
    method: run.method, variant: 'standard', caseId: testCase.caseId,
    repetition: run.repetition, status: run.status, durationMs: run.durationMs,
    observations: Object.fromEntries(run.observations.map((item) => [item.key, item.choice])),
  })));
}

const requiredCases: Record<Exclude<DiagramLabProtocol, 'personal'>, readonly string[]> = {
  reference: ['A', 'B', 'C'], arrows: ['D', 'E'],
  semantic: ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'],
  graph: ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'],
};

/** Only complete, successfully executed and internally consistent series count.
 * A partial newer report never overwrites the last valid complete reference.
 * For profile grouping, complete strategies may coexist; for method grouping,
 * strategies are kept separate. */
function completeReadings(readings: Reading[], protocol: Exclude<DiagramLabProtocol, 'personal'>, repetitions: number): Reading[] {
  const variants = new Map<string, Reading[]>();
  for (const row of readings) {
    const key = row.method + '\u0000' + row.variant;
    const rows = variants.get(key) ?? [];
    rows.push(row);
    variants.set(key, rows);
  }
  return [...variants.values()].filter((rows) =>
    requiredCases[protocol].every((id) => {
      const caseRows = rows.filter((row) => row.caseId === id);
      return caseRows.length === repetitions && caseRows.every((row) =>
        row.status === 'success' && Number.isInteger(row.repetition) && row.repetition >= 1 &&
        row.repetition <= repetitions) && new Set(caseRows.map((row) => row.repetition)).size === repetitions;
    })).flatMap((rows) => rows);
}

function goldAccuracy(battery: Battery, key?: string): Fraction | null {
  let correct = 0;
  let labelled = 0;
  let resolved = 0;
  for (const run of battery.readings) {
    const matchingCase = battery.entry.report.format === 'companion-scientific-diagram-fixture-report'
      ? battery.entry.report.cases.find((c) => c.caseId === run.caseId) : null;
    if (!matchingCase) continue;
    for (const [target, gold] of Object.entries(matchingCase.gold)) {
      if (key && target !== key) continue;
      if (gold !== 'present' && gold !== 'absent' && gold !== 'partial') continue;
      labelled++;
      const choice = run.observations[target];
      if (choice && choice !== 'uncertain') resolved++;
      if (choice === gold) correct++;
    }
  }
  // No model decision is not a claim of 0% accuracy.
  return labelled && resolved ? { n: correct, d: labelled, label: 'Décisions exactes / attendus étiquetés' } : null;
}

/** Recompute, rather than averaging existing percentages across dissimilar sizes.
 * The S0 baseline is required before a mutant may be classified. */
function sensitivityFractions(rows: Reading[]): {
  mutation: Fraction; correct: Fraction; controls: Fraction; rejection: Fraction; coverage: Fraction;
} {
  let hits = 0, comparable = 0, accepted = 0, valid = 0, falsePositive = 0, controlCount = 0;
  let falseRejection = 0, resolved = 0, expected = 0;
  const indexes = new Map<string, Reading>();
  for (const run of rows) indexes.set(run.method + ':' + run.variant + ':' + run.caseId + ':' + run.repetition, run);
  for (const run of rows) {
    const ref = DIAGRAM_SENSITIVITY_CASES.find((item) => item.id === run.caseId);
    if (!ref) continue;
    for (const [key, truth] of Object.entries(ref.gold)) {
      if (!scienceKeys.includes(key)) continue;
      expected++;
      const choice = run.observations[key];
      if (choice && choice !== 'uncertain') resolved++;
      if (truth === 'present') {
        valid++;
        if (choice === 'present') accepted++;
        if (choice === 'absent' || choice === 'partial') falseRejection++;
        if (run.caseId === 'S0' || run.caseId === 'S4') {
          controlCount++;
          if (choice === 'absent' || choice === 'partial') falsePositive++;
        }
      }
    }
    const target = ref.changedTarget;
    if (target && ['S1', 'S2', 'S3'].includes(run.caseId)) {
      const control = indexes.get(run.method + ':' + run.variant + ':S0:' + run.repetition);
      const base = control?.observations[target], observed = run.observations[target];
      if (base === 'present' && observed && observed !== 'uncertain') {
        comparable++;
        if (observed === 'absent') hits++;
      }
    }
  }
  return {
    mutation: { n: hits, d: comparable, label: 'Mutations correctement détectées / paires observables' },
    correct: { n: accepted, d: valid, label: 'Relations valides préservées / relations attendues correctes' },
    controls: { n: controlCount - falsePositive, d: controlCount, label: 'Relations témoins sans faux positif' },
    rejection: { n: valid - falseRejection, d: valid, label: 'Relations valides sans faux rejet' },
    coverage: { n: resolved, d: expected, label: 'Réponses déterminées / relations de référence' },
  };
}

function stabilityFraction(battery: Battery): Fraction | null {
  let stable = 0, examined = 0;
  const reps = battery.entry.plannedRepetitions;
  if (reps < 3) return null;
    const groups = new Map<string, Reading[]>();
    for (const run of battery.readings) {
      const key = run.method + '\u0000' + run.variant + '\u0000' + run.caseId;
      const group = groups.get(key) ?? [];
      group.push(run);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      if (group.length !== reps) continue;
      const gold = battery.entry.report.format === 'companion-scientific-diagram-fixture-report'
        ? battery.entry.report.cases.find((item) => item.caseId === group[0]?.caseId)?.gold
        : DIAGRAM_SENSITIVITY_CASES.find((item) => item.id === group[0]?.caseId)?.gold;
      for (const key of Object.keys(gold ?? {})) {
        examined++;
        const choices = group.map((run) => run.observations[key]);
        if (choices.every((choice) => !!choice && choice !== 'uncertain' && choice === choices[0])) stable++;
      }
    }
  return examined ? { n: stable, d: examined, label: 'Relations répétées à l’identique et déterminées' } : null;
}

function makeCandidateAxes(batteries: Map<DiagramLabProtocol, Battery>): Record<RadarAxisId, RadarAxisScore> {
  const reference = batteries.get('reference') ?? null;
  const arrows = batteries.get('arrows') ?? null;
  const semantic = batteries.get('semantic') ?? null;
  const graph = batteries.get('graph') ?? null;
  const valid = [reference, arrows, semantic, graph].filter((value): value is Battery => value !== null);
  const sem = semantic ? sensitivityFractions(semantic.readings) : null;
  const gr = graph ? sensitivityFractions(graph.readings) : null;
  const graphics = fromFraction(reference, 'Accord avec A/B/C', reference ? goldAccuracy(reference) : null, 'A/B/C non exécutés ou sans décision exploitable.');
  const arrowScore = fromFraction(arrows, 'Correspondance sur D/E', arrows ? goldAccuracy(arrows, SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET) : null, 'Paire D/E non complète ou sans décision sur les flèches.');
  const biology = fromFraction(semantic, 'Détection des mutations S1/S2/S3', sem?.mutation ?? null, 'S0–S5 incomplets ou aucune paire témoin/erreur observable.');
  const graphValue = gr && gr.mutation.d > 0 && gr.correct.d > 0
    ? limited((100 * gr.mutation.n / gr.mutation.d + 100 * gr.correct.n / gr.correct.d) / 2)
    : null;
  const relations: RadarAxisScore = graph && gr && graphValue !== null
    ? { value: graphValue, reason: '50 % détection des mutations + 50 % conservation des relations correctes.',
        evidence: [evidence(graph, gr.mutation.label, gr.mutation.n, gr.mutation.d),
          evidence(graph, gr.correct.label, gr.correct.n, gr.correct.d)] }
    : empty('Extraction de graphe S0–S5 manquante ou non mesurable.');
  const robustness = sem && gr && semantic && graph &&
    sem.rejection.d > 0 && sem.controls.d > 0 && gr.rejection.d > 0 && gr.controls.d > 0
    ? {
        value: limited(100 * (sem.rejection.n + sem.controls.n + gr.rejection.n + gr.controls.n) /
          (sem.rejection.d + sem.controls.d + gr.rejection.d + gr.controls.d)),
        reason: 'Relations correctes non rejetées et témoins sans faux positifs (lecture sémantique et graphe).',
        evidence: [
          evidence(semantic, sem.rejection.label, sem.rejection.n, sem.rejection.d),
          evidence(semantic, sem.controls.label, sem.controls.n, sem.controls.d),
          evidence(graph, gr.rejection.label, gr.rejection.n, gr.rejection.d),
          evidence(graph, gr.controls.label, gr.controls.n, gr.controls.d),
        ],
      } : empty('Deux batteries complètes (biologie et graphe) sont nécessaires.');
  const repeats = valid.flatMap((battery) => {
    const result = stabilityFraction(battery);
    return result ? [{ battery, result }] : [];
  });
  const stable = repeats.reduce((sum, item) => sum + item.result.n, 0);
  const examined = repeats.reduce((sum, item) => sum + item.result.d, 0);
  const stability: RadarAxisScore = examined > 0
    ? { value: percent(stable, examined), reason: 'Décisions déterminées identiques sur au moins trois passages.',
        evidence: repeats.map(({ battery, result }) =>
          evidence(battery, result.label, result.n, result.d)) }
    : empty('Au moins 3 passages d’une même batterie sont nécessaires.');
  let covered = 0, possible = 0;
  const coverageEvidence: RadarEvidence[] = [];
  for (const battery of valid) {
    if (battery.entry.protocol === 'semantic' || battery.entry.protocol === 'graph') {
      const fraction = sensitivityFractions(battery.readings).coverage;
      covered += fraction.n; possible += fraction.d;
      coverageEvidence.push(evidence(battery, fraction.label, fraction.n, fraction.d));
    } else {
      let localCovered = 0, localPossible = 0;
      for (const run of battery.readings) {
        const ref = battery.entry.report.format === 'companion-scientific-diagram-fixture-report'
          ? battery.entry.report.cases.find((item) => item.caseId === run.caseId) : null;
        for (const key of Object.keys(ref?.gold ?? {})) {
          possible++; localPossible++;
          if (run.observations[key] && run.observations[key] !== 'uncertain') {
            covered++; localCovered++;
          }
        }
      }
      coverageEvidence.push(evidence(battery, 'Décisions déterminées / attendus', localCovered, localPossible));
    }
  }
  const coverage: RadarAxisScore = possible > 0
    ? { value: percent(covered, possible), reason: 'Part des décisions déterminées dans les batteries complètes.',
        evidence: coverageEvidence }
    : empty('Aucune batterie complète avec attendus mesurables.');
  const durations = valid.flatMap((battery) => battery.readings
    .map((run) => run.durationMs).filter((ms) => Number.isFinite(ms) && ms >= 0));
  const avgMs = durations.length ? durations.reduce((sum, ms) => sum + ms, 0) / durations.length : null;
  const speed: RadarAxisScore = avgMs !== null
    ? { value: limited(100 / (1 + avgMs / 60_000)),
        reason: '100 ÷ (1 + durée moyenne par dessin / 60 s). Les variantes à appels supplémentaires portent leur coût.',
        evidence: valid.map((b) => evidence(b, 'Durée incluse (ms rapportés)', b.readings.reduce((n, r) => n + r.durationMs, 0), b.readings.length)) }
    : empty('Durée non renseignée sur les batteries complètes.');
  return { graphics, arrows: arrowScore, biology, relations, robustness, stability, coverage, speed };
}

export function buildDiagramLabRadar(entries: readonly DiagramLabArchiveEntry[], grouping: RadarGrouping = 'profile'): RadarCandidate[] {
  const candidates = new Map<string, CandidateDraft>();
  for (const entry of [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (entry.state !== 'finished' || entry.protocol === 'personal') continue;
    const rows = flatten(entry);
    const participant = new Map<string, Reading[]>();
    for (const row of rows) {
      const key = grouping === 'method' ? row.profileId + '\u0000' + row.method + '\u0000' + row.variant : row.profileId;
      const participantRows = participant.get(key) ?? [];
      participantRows.push(row);
      participant.set(key, participantRows);
    }
    for (const [key, participantRows] of participant) {
      const full = completeReadings(participantRows, entry.protocol, entry.plannedRepetitions);
      const first = participantRows[0];
      if (!first) continue;
      let candidate = candidates.get(key);
      if (!candidate) {
        candidate = { id: key, profileId: first.profileId, name: first.profileName,
          updatedAt: entry.createdAt, methods: new Set<string>(), models: new Set<string>(),
          batteries: new Map<DiagramLabProtocol, Battery>() };
        candidates.set(key, candidate);
      }
      for (const row of participantRows) {
        candidate.methods.add(row.method + (row.variant === 'standard' ? '' : ' · ' + row.variant));
        if (row.model) candidate.models.add(row.model);
      }
      if (full.length && !candidate.batteries.has(entry.protocol)) {
        candidate.batteries.set(entry.protocol, { entry, readings: full });
      }
    }
  }
  return [...candidates.values()].map((candidate) => {
    const axes = makeCandidateAxes(candidate.batteries);
    const measured = RADAR_AXES.filter((axis) => axes[axis.id].value !== null).length;
    return {
      id: candidate.id, profileId: candidate.profileId,
      name: grouping === 'method' ? candidate.name + ' · ' + [...candidate.methods].join(', ') : candidate.name,
      methods: [...candidate.methods].sort(), models: [...candidate.models].sort(),
      axes, measured, complete: measured === RADAR_AXES.length, updatedAt: candidate.updatedAt,
    };
  }).sort((a, b) => b.measured - a.measured || a.name.localeCompare(b.name, 'fr'));
}

export function validRadarWeights(value: unknown): value is RadarWeights {
  return !!value && typeof value === 'object' && RADAR_AXES.every((axis) => {
    const weight = (value as Record<string, unknown>)[axis.id];
    return typeof weight === 'number' && Number.isInteger(weight) && weight >= 0 && weight <= 5;
  }) && RADAR_AXES.some((axis) => (value as RadarWeights)[axis.id] > 0);
}

export function rankDiagramLabRadar(candidates: readonly RadarCandidate[], weights: RadarWeights): RadarRankedCandidate[] {
  if (!validRadarWeights(weights)) return candidates.map((candidate) => ({ ...candidate, weightedScore: null }));
  const totalWeight = RADAR_AXES.reduce((sum, axis) => sum + weights[axis.id], 0);
  return candidates.map((candidate) => ({
    ...candidate,
    weightedScore: candidate.complete
      ? limited(RADAR_AXES.reduce((sum, axis) => sum + (candidate.axes[axis.id].value ?? 0) * weights[axis.id], 0) / totalWeight)
      : null,
  })).sort((a, b) => (b.weightedScore ?? -1) - (a.weightedScore ?? -1) ||
    b.measured - a.measured || a.name.localeCompare(b.name, 'fr'));
}


/** Method-only ranking: compare exactly the same measured axes across all
 * participating algorithms, never fill unavailable axes with zero. It is not
 * an eight-axis global leaderboard. */
export function compareRadarCommonAxes(candidates: readonly RadarCandidate[], weights: RadarWeights) {
  const commonAxes = RADAR_AXES.filter((axis) => candidates.length >= 2 &&
    candidates.every((candidate) => candidate.axes[axis.id].value !== null));
  const weighted = commonAxes.filter((axis) => weights[axis.id] > 0);
  const total = weighted.reduce((sum, axis) => sum + weights[axis.id], 0);
  const comparable = validRadarWeights(weights) && weighted.length >= 4 && total > 0;
  const rows = candidates.map((candidate) => ({
    id: candidate.id,
    score: comparable
      ? limited(weighted.reduce((sum, axis) => sum + candidate.axes[axis.id].value! * weights[axis.id], 0) / total)
      : null,
  })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return { commonAxes: commonAxes.map((axis) => axis.id), weightedAxes: weighted.map((axis) => axis.id), rows };
}
