import {
  DIAGRAM_SENSITIVITY_CASES, DIAGRAM_SENSITIVITY_TARGETS,
  summarizeDiagramSensitivity, type DiagramSensitivityCaseId,
  type DiagramSensitivityChoice, type DiagramSensitivityReading,
} from './scientificDiagramSensitivity.ts';

export const DIAGRAM_BLIND_OBSERVATION_PROTOCOL = 'scientific-diagram-blind-graph-v1';

export type ObservedArrowTip = 'first' | 'second' | 'none' | 'unclear';
export type ObservedSpatialRelation = 'inside' | 'outside' | 'unclear';

export interface ObservedVisualGraph {
  /** Literal texts copied from the drawing, not inferred biological structures. */
  labels: string[];
  arrows: Array<{ first: string; second: string; tip: ObservedArrowTip }>;
  containment: Array<{ inner: string; outer: string; relation: ObservedSpatialRelation }>;
  /** Whether all visible strokes could be traced; a model assertion, not proof. */
  arrowsComplete: boolean;
}

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function short(value: unknown): string {
  if (typeof value !== 'string' || value.length > 90 || !value.trim()) throw new Error('Sortie visuelle invalide.');
  return value.trim();
}

/** Reject partial, guessed, oversized or malformed vision outputs rather than
 * interpreting missing relation evidence as a negative observation. */
export function parseObservedVisualGraph(raw: string): ObservedVisualGraph {
  if (raw.length > 24_000) throw new Error('Sortie visuelle trop longue.');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('JSON visuel illisible.'); }
  if (!plain(parsed) || !Array.isArray(parsed.labels) || !Array.isArray(parsed.arrows)
    || !Array.isArray(parsed.containment) || typeof parsed.arrowsComplete !== 'boolean'
    || parsed.labels.length > 32 || parsed.arrows.length > 48 || parsed.containment.length > 48) {
    throw new Error('Structure du graphe visuel invalide.');
  }
  const labels = parsed.labels.map(short);
  const arrows = parsed.arrows.map((value: unknown) => {
    if (!plain(value) || !['first', 'second', 'none', 'unclear'].includes(String(value.tip))) {
      throw new Error('Flèche visuelle invalide.');
    }
    const first = short(value.first);
    const second = short(value.second);
    return { first, second, tip: value.tip as ObservedArrowTip };
  });
  const containment = parsed.containment.map((value: unknown) => {
    if (!plain(value) || !['inside', 'outside', 'unclear'].includes(String(value.relation))) {
      throw new Error('Inclusion visuelle invalide.');
    }
    return { inner: short(value.inner), outer: short(value.outer),
      relation: value.relation as ObservedSpatialRelation };
  });
  return { labels, arrows, containment, arrowsComplete: parsed.arrowsComplete };
}

export const BLIND_VISUAL_OBSERVATION_PROMPT = [
  'Observe uniquement les pixels du dessin scientifique joint.',
  'Cette étape ne connaît pas le barème, le sujet, les réponses attendues ni la discipline : ne note rien.',
  'Transcris les étiquettes réellement visibles dans labels, sans inventer de mots.',
  'Pour chaque trait avec ou sans pointe, suis le tracé réellement dessiné : first et second sont les deux étiquettes ou objets aux extrémités, tip vaut first si la pointe touche first, second si elle touche second, none si aucune pointe, unclear si elle est indiscernable.',
  'Ne déduis jamais le sens des flèches de tes connaissances scientifiques, de la lecture gauche-droite ou de l’ordre des mots.',
  'Dans containment, rapporte uniquement les paires de contours observables : inner, outer, relation inside/outside/unclear. Ne transforme pas un mot écrit en une structure dessinée.',
  'arrowsComplete vaut true uniquement si toutes les flèches visibles ont été examinées ; sinon false. Si tu hésites, utilise unclear.',
  'Réponds exclusivement en JSON avec labels, arrows, containment, arrowsComplete. Aucun texte supplémentaire.',
].join('\n');

/** Normalization is used for matching labels only, never to reconstruct an arrow. */
function sameLabel(a: string, b: string): boolean {
  const normalize = (input: string) => input.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g, '');
  return normalize(a) === normalize(b);
}

function checkArrow(graph: ObservedVisualGraph, from: string, to: string): DiagramSensitivityChoice {
  if (!graph.labels.some((label) => sameLabel(label, from))
    || !graph.labels.some((label) => sameLabel(label, to))) return 'uncertain';
  const matches = graph.arrows.filter((item) =>
    (sameLabel(item.first, from) && sameLabel(item.second, to)) ||
    (sameLabel(item.first, to) && sameLabel(item.second, from)));
  const correctlyDirected = matches.some((item) =>
    (sameLabel(item.first, from) && item.tip === 'second') ||
    (sameLabel(item.second, from) && item.tip === 'first'));
  const reversed = matches.some((item) =>
    (sameLabel(item.first, from) && item.tip === 'first') ||
    (sameLabel(item.second, from) && item.tip === 'second'));
  // Contradictory, untipped or indistinct arrows are not proof of correctness.
  if (matches.some((item) => item.tip === 'unclear' || item.tip === 'none')
    || (correctlyDirected && reversed)) return 'uncertain';
  if (correctlyDirected) return 'present';
  if (reversed) return 'absent';
  // An unrelated edge is only evidence of a missing connection when the
  // observer claims every arrow has been traced; this claim may be wrong.
  return graph.arrowsComplete ? 'absent' : 'uncertain';
}

function checkContainment(graph: ObservedVisualGraph, inner: string, outer: string): DiagramSensitivityChoice {
  if (!graph.labels.some((label) => sameLabel(label, inner))
    || !graph.labels.some((label) => sameLabel(label, outer))) return 'uncertain';
  const relevant = graph.containment.filter((item) =>
    sameLabel(item.inner, inner) && sameLabel(item.outer, outer));
  if (relevant.some((item) => item.relation === 'unclear')) return 'uncertain';
  if (relevant.some((item) => item.relation === 'inside') &&
    relevant.some((item) => item.relation === 'outside')) return 'uncertain';
  if (relevant.some((item) => item.relation === 'inside')) return 'present';
  if (relevant.some((item) => item.relation === 'outside')) return 'absent';
  return 'uncertain';
}

/** The correct answer becomes available only here, after the model returned
 * its complete blind graph. This function does not call the model. */
export function compareBlindVisualGraph(graph: ObservedVisualGraph): Record<string, DiagramSensitivityChoice> {
  return {
    [DIAGRAM_SENSITIVITY_TARGETS.transcription]: checkArrow(graph, 'ADN', 'ARN'),
    [DIAGRAM_SENSITIVITY_TARGETS.translation]: checkArrow(graph, 'ARN', 'Protéine'),
    [DIAGRAM_SENSITIVITY_TARGETS.nucleus]: checkContainment(graph, 'Noyau', 'Cellule'),
  };
}

export interface BlindVisualObservationRun {
  caseId: DiagramSensitivityCaseId;
  repetition: number;
  profileId: string;
  profileName: string;
  model: string;
  durationMs: number;
  status: 'success' | 'failed' | 'aborted';
  observations: Record<string, DiagramSensitivityChoice>;
  arrowCount: number;
  containmentCount: number;
  errorCategory?: 'invalid-output' | 'network' | 'cancelled';
}

export function buildBlindVisualObservationReport(
  runs: readonly BlindVisualObservationRun[], repetitions: 1 | 3 | 5, createdAt: string,
) {
  const readings: DiagramSensitivityReading[] = runs.map((run) => ({
    caseId: run.caseId, repetition: run.repetition,
    profileId: run.profileId, method: 'blind-graph',
    observations: run.observations,
  }));
  return {
    format: 'companion-scientific-diagram-blind-graph-report',
    version: 1, protocolId: DIAGRAM_BLIND_OBSERVATION_PROTOCOL,
    createdAt, plannedRepetitions: repetitions, localOnly: true,
    cases: DIAGRAM_SENSITIVITY_CASES.map(({ id, label, referenceScore, mutation, gold }) => ({
      caseId: id, label, mutation, referenceScore, gold: { ...gold },
      experiments: runs.filter((run) => run.caseId === id).map(({ caseId: _caseId, ...rest }) => rest),
    })),
    statistics: summarizeDiagramSensitivity(readings),
    limitations: 'Extraction visuelle locale et séparée : aucun barème ni réponse attendue envoyés au modèle. Le comparateur de graphe vérifie trois relations de référence après extraction. Une flèche manquante est considérée absente seulement si le modèle affirme avoir parcouru toutes les flèches ; cette affirmation peut être fausse. Une absence de preuve n’est pas un zéro. S5 est indécidable sur la première flèche. Références synthétiques provisoires, à valider par un professeur. Aucun pixel, graphe brut, prompt, endpoint ni clé API exportés.',
  };
}
