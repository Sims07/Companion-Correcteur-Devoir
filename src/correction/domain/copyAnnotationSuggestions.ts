import { parseModelJson } from '../../shared/domain/modelJson.ts';
import { isCopyAnnotationPlacement, MAX_COPY_ANNOTATION_LENGTH, type CopyAnnotation } from './copyAnnotationFeature.ts';

export interface CopyAnnotationCriterion {
  criterionId: string;
  title: string;
  points: number;
  maxPoints: number;
  evidence: string;
  rationale: string;
  remark?: string;
  pageNumber?: number;
}

export const MAX_ANNOTATION_SUGGESTIONS = 10;

export function annotationEndpointIsLocal(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '[::1]' || host.endsWith('.local')) return true;
    if (/^\[(?:f[cd][\da-f]{2}|fe[89ab][\da-f]):/i.test(host)) return true;
    if (!/^\d+(?:\.\d+){3}$/.test(host)) return false;
    const [first, second] = host.split('.').map(Number);
    return first === 127 || first === 10 || (first === 192 && second === 168)
      || (first === 172 && second >= 16 && second <= 31) || (first === 169 && second === 254);
  } catch { return false; }
}

export function parseCopyAnnotationSuggestions(raw: string, criteria: readonly CopyAnnotationCriterion[], pages: number): CopyAnnotation[] {
  const result = parseModelJson(raw) as { annotations?: unknown } | null;
  if (!Array.isArray(result?.annotations)) throw new Error('Le modèle local n’a pas renvoyé de liste d’annotations.');
  const knownCriteria = new Set(criteria.map((criterion) => criterion.criterionId));
  const seen = new Set<string>();
  const suggestions: CopyAnnotation[] = [];
  for (const value of result.annotations) {
    if (suggestions.length >= MAX_ANNOTATION_SUGGESTIONS) break;
    if (!value || typeof value !== 'object' || typeof value.message !== 'string') continue;
    const message = value.message.trim().replace(/\s+/gu, ' ').slice(0, MAX_COPY_ANNOTATION_LENGTH);
    if (!message) continue;
    const criterionId = knownCriteria.has(value.criterionId) ? value.criterionId as string : undefined;
    const key = message.toLocaleLowerCase('fr-FR');
    if (seen.has(key)) continue;
    seen.add(key);
    const placement = value.locationConfidence === 'high'
      && isCopyAnnotationPlacement(value.placement) && value.placement.pageNumber <= pages
      ? { pageNumber: value.placement.pageNumber, x: value.placement.x, y: value.placement.y } : undefined;
    suggestions.push({ id: crypto.randomUUID(), message, criterionId, placement, status: 'suggested' });
  }
  if (result.annotations.length && !suggestions.length) throw new Error('Les remarques renvoyées par le modèle local sont illisibles.');
  return suggestions;
}

export function appendNewCopyAnnotations(existing: CopyAnnotation[], suggestions: CopyAnnotation[]): CopyAnnotation[] {
  const messages = new Set(existing.map((entry) => entry.message.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('fr-FR')));
  const next = suggestions.filter((entry) => !messages.has(entry.message.toLocaleLowerCase('fr-FR')));
  return [...existing, ...next];
}
