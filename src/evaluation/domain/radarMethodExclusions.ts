import type { BiologyRadarObservation } from './biologyTeacherRadar.ts';
import type { DiagramLabArchiveEntry } from './diagramLabHistory.ts';
import { scienceMethods, type ScienceMethod, type TimelinePoint } from './radarTimeline.ts';

export type RadarMethodDomain = 'diagrams' | 'biology';
export const biologyMethodLabels = {
  contract: 'Contrats par question',
  standard: 'Barème standard',
  pilot: 'Pilote (historique)',
} as const;
export type BiologyMethodId = keyof typeof biologyMethodLabels;

export interface RadarMethodExclusions {
  diagrams: ScienceMethod[];
  biology: BiologyMethodId[];
}
export const EMPTY_RADAR_EXCLUSIONS: RadarMethodExclusions = { diagrams: [], biology: [] };
const KEY = 'companion:radar-method-exclusions:v1';

export function parseRadarMethodExclusions(input: unknown): RadarMethodExclusions {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const allowed = (value: unknown, keys: readonly string[]) => Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && keys.includes(entry)))]
    : [];
  return {
    diagrams: allowed(data.diagrams, Object.keys(scienceMethods)) as ScienceMethod[],
    biology: allowed(data.biology, Object.keys(biologyMethodLabels)) as BiologyMethodId[],
  };
}

export function loadRadarMethodExclusions(): RadarMethodExclusions {
  try { return parseRadarMethodExclusions(JSON.parse(window.localStorage.getItem(KEY) ?? '{}')); }
  catch { return { diagrams: [], biology: [] }; }
}
export function saveRadarMethodExclusions(value: RadarMethodExclusions): boolean {
  try { window.localStorage.setItem(KEY, JSON.stringify(parseRadarMethodExclusions(value))); return true; }
  catch { return false; }
}

/** Excluding a method never deletes the evidence: it only removes it from active scoring and scheduling. */
export function methodIsActive(exclusions: RadarMethodExclusions, domain: RadarMethodDomain, id?: string): boolean {
  return !id || !(exclusions[domain] as readonly string[]).includes(id);
}
export function toggleRadarMethodExclusion(
  previous: RadarMethodExclusions, domain: RadarMethodDomain, id: string,
): RadarMethodExclusions {
  const allowed = domain === 'diagrams' ? Object.keys(scienceMethods) : Object.keys(biologyMethodLabels);
  if (!allowed.includes(id)) return previous;
  const next = (previous[domain] as string[]).includes(id)
    ? previous[domain].filter(value => value !== id)
    : [...previous[domain], id];
  return parseRadarMethodExclusions({ ...previous, [domain]: next });
}

export function timelineMethodId(domain: RadarMethodDomain, point: TimelinePoint): string | undefined {
  return domain === 'diagrams' ? point.scienceMethod
    : (point.biologyMethod ?? (point.label.startsWith('Pilote ·') ? 'pilot' : undefined));
}
export function activeTimelinePoints(
  points: readonly TimelinePoint[], domain: RadarMethodDomain, exclusions: RadarMethodExclusions,
): TimelinePoint[] {
  return points.filter(point => methodIsActive(exclusions, domain, timelineMethodId(domain, point)));
}
export function activeScienceEntries(
  entries: readonly DiagramLabArchiveEntry[], exclusions: RadarMethodExclusions,
): DiagramLabArchiveEntry[] {
  return entries.filter(entry => methodIsActive(exclusions, 'diagrams', entry.trial?.method));
}
export function activeBiologyObservations(
  history: readonly BiologyRadarObservation[], exclusions: RadarMethodExclusions,
): BiologyRadarObservation[] {
  return history.filter(row => methodIsActive(exclusions, 'biology', row.protocol));
}
