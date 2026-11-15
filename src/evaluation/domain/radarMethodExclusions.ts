import type { BiologyRadarObservation } from './biologyTeacherRadar.ts';
import type { DiagramLabArchiveEntry } from './diagramLabHistory.ts';
import { RADAR_PRESETS, type RadarWeights } from './diagramLabRadar.ts';
import {
  biologyRunMethodLabel, scienceMethods, sciencePoints, type TimelinePoint,
} from './radarTimeline.ts';

export type RadarMethodDomain = 'diagrams' | 'biology';
export const biologyMethodLabels = {
  contract: 'Contrats par question',
  standard: 'Barème standard',
  pilot: 'Pilote (historique)',
} as const;
export type BiologyMethodId = keyof typeof biologyMethodLabels;

/** Keep existing protocol/strategy ids valid; observed archived methods get stable namespaced ids. */
export interface RadarMethodExclusions {
  diagrams: string[];
  biology: string[];
}
export const EMPTY_RADAR_EXCLUSIONS: RadarMethodExclusions = { diagrams: [], biology: [] };
const KEY = 'companion:radar-method-exclusions:v1';
const OBSERVED_PREFIX = { diagrams: 'historique:', biology: 'variante:' } as const;

export function observedRadarMethodId(domain: RadarMethodDomain, label: string): string {
  return OBSERVED_PREFIX[domain] + label;
}
function allowedId(domain: RadarMethodDomain, id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const known = domain === 'diagrams' ? Object.keys(scienceMethods) : Object.keys(biologyMethodLabels);
  if (known.includes(id)) return true;
  const prefix = OBSERVED_PREFIX[domain];
  return id.startsWith(prefix) && id.length > prefix.length && id.length <= 512 &&
    !/[\u0000-\u001f]/.test(id);
}

export function parseRadarMethodExclusions(input: unknown): RadarMethodExclusions {
  const data = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const values = (domain: RadarMethodDomain): string[] => Array.isArray(data[domain])
    ? [...new Set(data[domain].filter((id: unknown) => allowedId(domain, id)))] : [];
  return { diagrams: values('diagrams'), biology: values('biology') };
}
export function loadRadarMethodExclusions(): RadarMethodExclusions {
  try { return parseRadarMethodExclusions(JSON.parse(window.localStorage.getItem(KEY) ?? '{}')); }
  catch { return { diagrams: [], biology: [] }; }
}
export function saveRadarMethodExclusions(value: RadarMethodExclusions): boolean {
  try { window.localStorage.setItem(KEY, JSON.stringify(parseRadarMethodExclusions(value))); return true; }
  catch { return false; }
}

export function methodIsActive(exclusions: RadarMethodExclusions, domain: RadarMethodDomain, id?: string): boolean {
  return !id || !exclusions[domain].includes(id);
}
export function toggleRadarMethodExclusion(
  previous: RadarMethodExclusions, domain: RadarMethodDomain, id: string,
): RadarMethodExclusions {
  if (!allowedId(domain, id)) return previous;
  const next = previous[domain].includes(id)
    ? previous[domain].filter(value => value !== id)
    : [...previous[domain], id];
  return parseRadarMethodExclusions({ ...previous, [domain]: next });
}

/** A gallery card and its checkbox must resolve to exactly the same ID. */
export function timelineMethodId(domain: RadarMethodDomain, point: TimelinePoint): string | undefined {
  if (domain === 'diagrams') return point.scienceMethod ?? (point.label
    ? observedRadarMethodId(domain, point.label) : undefined);
  return point.label ? observedRadarMethodId(domain, point.label)
    : (point.biologyMethod ?? undefined);
}

function biologyProtocolFor(point: TimelinePoint): BiologyMethodId | undefined {
  if (point.biologyMethod) return point.biologyMethod;
  if (point.label?.startsWith('Pilote ·')) return 'pilot';
  if (point.label?.startsWith('Contrats par question ·')) return 'contract';
  if (point.label?.startsWith('Barème standard ·')) return 'standard';
  return undefined;
}

/** Protocol exclusions from previous versions remain authoritative alongside finer observed variants. */
export function timelineMethodIsActive(
  exclusions: RadarMethodExclusions, domain: RadarMethodDomain, point: TimelinePoint,
): boolean {
  return methodIsActive(exclusions, domain, timelineMethodId(domain, point)) &&
    (domain !== 'biology' || methodIsActive(exclusions, domain, biologyProtocolFor(point)));
}
export function activeTimelinePoints(
  points: readonly TimelinePoint[], domain: RadarMethodDomain, exclusions: RadarMethodExclusions,
): TimelinePoint[] {
  return points.filter(point => timelineMethodIsActive(exclusions, domain, point));
}

/** An archived, pre-trial radar is not one of the five newer graph strategies.
 * Identify its displayed label from its evidence so exclusions can hide its score too. */
export function activeScienceEntries(
  entries: readonly DiagramLabArchiveEntry[], exclusions: RadarMethodExclusions,
  weights: RadarWeights = RADAR_PRESETS.balanced,
): DiagramLabArchiveEntry[] {
  return entries.filter(entry => {
    if (entry.trial) return methodIsActive(exclusions, 'diagrams', entry.trial.method);
    if (!exclusions.diagrams.some(id => id.startsWith(OBSERVED_PREFIX.diagrams)) ||
      !entry.report || entry.report.format === 'companion-scientific-diagram-protocol') return true;
    const labels = sciencePoints([entry], weights).map(point => point.label);
    return !labels.length || labels.some(label =>
      methodIsActive(exclusions, 'diagrams', observedRadarMethodId('diagrams', label)));
  });
}
export function activeBiologyObservations(
  history: readonly BiologyRadarObservation[], exclusions: RadarMethodExclusions,
): BiologyRadarObservation[] {
  return history.filter(row => methodIsActive(exclusions, 'biology', row.protocol) &&
    methodIsActive(exclusions, 'biology', observedRadarMethodId('biology',
      biologyRunMethodLabel(row.protocol, row.method, row.provider))));
}
