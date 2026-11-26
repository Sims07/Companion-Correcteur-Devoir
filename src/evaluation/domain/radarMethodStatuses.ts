import type { ScienceMethod } from './radarTimeline.ts';
import type { BiologyMethodId, RadarMethodDomain } from './radarMethodExclusions.ts';

/** Research tracking only: this classification does not alter a correction, campaign or radar score. */
export type RadarMethodStatus = 'candidate' | 'evaluating' | 'shelved';

export const RADAR_METHOD_STATUS_GROUPS: readonly {
  id: RadarMethodStatus; label: string; description: string;
}[] = [
  { id: 'candidate', label: 'Potentiellement utilisable',
    description: 'Parcours à privilégier pour les prochains essais sur de vraies copies, sous validation du professeur.' },
  { id: 'evaluating', label: 'En cours d’évaluation',
    description: 'Pistes à comparer avant de décider si elles sont suffisamment fiables.' },
  { id: 'shelved', label: 'Mis de côté',
    description: 'Pistes conservées pour mémoire, sans priorité de test pour le moment.' },
];

/** Initial editorial classification, not a measured ranking or a restriction. */
export const DEFAULT_DIAGRAM_METHOD_STATUSES: Record<ScienceMethod, RadarMethodStatus> = {
  'image-direct-v1': 'candidate',
  'direct-image-generative-thinking': 'evaluating',
  'direct-image-systemone': 'evaluating',
  'direct-image-logprobs': 'evaluating',
  'direct-image-hybrid': 'evaluating',
  'direct-image-hybrid-zoom': 'evaluating',
  'direct-v1': 'evaluating',
  'graph-first-v2': 'evaluating',
  'pixel-v1': 'shelved',
  'leaders-v1': 'shelved',
  'guided-v1': 'shelved',
  'graph-first-v1': 'shelved',
  'vision-then-analysis': 'shelved',
};

export const DEFAULT_BIOLOGY_METHOD_STATUSES: Record<BiologyMethodId, RadarMethodStatus> = {
  contract: 'evaluating',
  standard: 'evaluating',
  pilot: 'shelved',
};

export type RadarMethodStatusOverrides = Record<RadarMethodDomain, Record<string, RadarMethodStatus>>;
export const EMPTY_RADAR_METHOD_STATUSES: RadarMethodStatusOverrides = { diagrams: {}, biology: {} };
const STORAGE_KEY = 'companion:radar-method-statuses:v1';

function knownMethod(domain: RadarMethodDomain, id: string): boolean {
  return Object.hasOwn(domain === 'diagrams' ? DEFAULT_DIAGRAM_METHOD_STATUSES : DEFAULT_BIOLOGY_METHOD_STATUSES, id);
}

function validStatus(value: unknown): value is RadarMethodStatus {
  return value === 'candidate' || value === 'evaluating' || value === 'shelved';
}

/** Unknown/retired identifiers and corrupt values cannot leak into the UI. */
export function parseRadarMethodStatuses(input: unknown): RadarMethodStatusOverrides {
  const data = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown> : {};
  const parseDomain = (domain: RadarMethodDomain): Record<string, RadarMethodStatus> => {
    const raw = data[domain];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([id, value]) =>
      knownMethod(domain, id) && validStatus(value))) as Record<string, RadarMethodStatus>;
  };
  return { diagrams: parseDomain('diagrams'), biology: parseDomain('biology') };
}

export function radarMethodStatus(
  state: RadarMethodStatusOverrides, domain: RadarMethodDomain, id: string,
): RadarMethodStatus {
  const defaults = domain === 'diagrams' ? DEFAULT_DIAGRAM_METHOD_STATUSES : DEFAULT_BIOLOGY_METHOD_STATUSES;
  return state[domain][id] ?? (defaults as Record<string, RadarMethodStatus>)[id] ?? 'evaluating';
}

export function updateRadarMethodStatus(
  state: RadarMethodStatusOverrides, domain: RadarMethodDomain, id: string, status: RadarMethodStatus,
): RadarMethodStatusOverrides {
  if (!knownMethod(domain, id) || !validStatus(status)) return state;
  const next = { ...state[domain] };
  const defaults = domain === 'diagrams' ? DEFAULT_DIAGRAM_METHOD_STATUSES : DEFAULT_BIOLOGY_METHOD_STATUSES;
  if (status === (defaults as Record<string, RadarMethodStatus>)[id]) delete next[id];
  else next[id] = status;
  return { ...state, [domain]: next };
}

export function loadRadarMethodStatuses(): RadarMethodStatusOverrides {
  try { return parseRadarMethodStatuses(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}')); }
  catch { return { diagrams: {}, biology: {} }; }
}

export function saveRadarMethodStatuses(statuses: RadarMethodStatusOverrides): boolean {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parseRadarMethodStatuses(statuses))); return true; }
  catch { return false; }
}
