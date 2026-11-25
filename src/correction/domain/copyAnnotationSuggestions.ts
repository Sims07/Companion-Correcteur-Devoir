import type { SubcriterionProposal } from './grading.ts';
import { normalizeGradeScore, sumGradeScores } from '../../shared/domain/scorePrecision.ts';
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
  subcriteria?: readonly SubcriterionProposal[];
}

export const MAX_ANNOTATION_SUGGESTIONS = 10;

interface RequiredDeduction {
  deductionId: string;
  criterionId: string;
  title: string;
  pointsRemoved: number;
  evidence: string;
  pageNumber?: number;
}

/** Only use the detailed scores if they reconcile with the current teacher score. */
export function requiredCopyAnnotationDeductions(criteria: readonly CopyAnnotationCriterion[]): RequiredDeduction[] {
  return criteria.flatMap((criterion) => {
    const removed = normalizeGradeScore(Math.max(0, Math.max(0, criterion.maxPoints) - criterion.points));
    if (!Number.isFinite(removed) || removed <= 0) return [];
    const subcriteria = criterion.subcriteria;
    const detailed = subcriteria?.length
      && subcriteria.every((entry) => entry.assessmentStatus !== 'not-evaluated')
      && sumGradeScores(subcriteria.map((entry) => entry.points)) === normalizeGradeScore(criterion.points)
      && sumGradeScores(subcriteria.map((entry) => entry.maxPoints)) === normalizeGradeScore(criterion.maxPoints);
    const make = (title: string, pointsRemoved: number, evidence: string, subcriterionId?: string): RequiredDeduction => ({
      deductionId: 'deduction-' + encodeURIComponent(JSON.stringify([criterion.criterionId, subcriterionId ?? null])),
      criterionId: criterion.criterionId, title, pointsRemoved, evidence, pageNumber: criterion.pageNumber,
    });
    if (detailed && subcriteria) return subcriteria.flatMap((entry) => {
      const points = normalizeGradeScore(entry.maxPoints - entry.points);
      return points > 0 ? [make(criterion.title + ' — ' + entry.title, points, entry.evidence, entry.subcriterionId)] : [];
    });
    // A manual parent-score adjustment must not be falsely attributed to a subcriterion.
    const evidence = criterion.remark || criterion.rationale || criterion.evidence;
    return [make(criterion.title, removed, evidence)];
  });
}

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
  const required = requiredCopyAnnotationDeductions(criteria);
  const requiredById = new Map(required.map((entry) => [entry.deductionId, entry]));
  const matched = new Map<string, CopyAnnotation>();
  const knownCriteria = new Set(criteria.map((criterion) => criterion.criterionId));
  const seen = new Set<string>();
  const suggestions: CopyAnnotation[] = [];
  for (const value of result.annotations) {
    if (!value || typeof value !== 'object' || typeof value.message !== 'string') continue;
    const message = value.message.trim().replace(/\s+/gu, ' ').slice(0, MAX_COPY_ANNOTATION_LENGTH);
    if (!message) continue;
    const criterionId = knownCriteria.has(value.criterionId) ? value.criterionId as string : undefined;
    const placement = value.locationConfidence === 'high'
      && isCopyAnnotationPlacement(value.placement) && value.placement.pageNumber <= pages
      ? { pageNumber: value.placement.pageNumber, x: value.placement.x, y: value.placement.y } : undefined;
    const tone = value.tone === 'positive' || value.tone === 'improvement' ? value.tone : undefined;
    if (typeof value.deductionId === 'string') {
      const deduction = requiredById.get(value.deductionId);
      if (deduction && tone === 'improvement' && !matched.has(deduction.deductionId)) {
        matched.set(deduction.deductionId, {
          id: deduction.deductionId, message, criterionId: deduction.criterionId, placement, tone, status: 'suggested',
        });
      }
      continue;
    }
    const key = message.toLocaleLowerCase('fr-FR');
    if (suggestions.length >= MAX_ANNOTATION_SUGGESTIONS || seen.has(key)) continue;
    seen.add(key);
    suggestions.push({ id: crypto.randomUUID(), message, criterionId, placement, status: 'suggested', ...(tone ? { tone } : {}) });
  }
  if (result.annotations.length && !suggestions.length && !required.length) throw new Error('Les remarques renvoyées par le modèle local sont illisibles.');
  const mandatory: CopyAnnotation[] = required.map((entry) => matched.get(entry.deductionId) ?? {
    id: entry.deductionId, criterionId: entry.criterionId, tone: 'improvement', status: 'suggested',
    // Keep the actual correction evidence, without inventing a location or a new decision.
    message: (entry.title + (entry.evidence.trim() ? ' : ' + entry.evidence.trim() : ' : à revoir.'))
      .replace(/\s+/gu, ' ').slice(0, MAX_COPY_ANNOTATION_LENGTH),
  });
  const mandatoryMessages = new Set(mandatory.map((entry) => entry.message.toLocaleLowerCase('fr-FR')));
  return [...mandatory, ...suggestions.filter((entry) => !mandatoryMessages.has(entry.message.toLocaleLowerCase('fr-FR')))];
}

export function appendNewCopyAnnotations(existing: CopyAnnotation[], suggestions: CopyAnnotation[]): CopyAnnotation[] {
  const messages = new Set(existing.map((entry) => entry.message.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('fr-FR')));
  const ids = new Set(existing.map((entry) => entry.id));
  const next = suggestions.filter((entry) => entry.id.startsWith('deduction-')
    ? !ids.has(entry.id)
    : !messages.has(entry.message.toLocaleLowerCase('fr-FR')));
  return [...existing, ...next];
}
