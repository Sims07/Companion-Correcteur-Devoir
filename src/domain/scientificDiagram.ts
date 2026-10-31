import type { Rubric } from './rubric.ts';

export const SCIENTIFIC_DIAGRAM_QUALITY_DIMENSIONS = ['title', 'scientific-accuracy', 'completeness', 'labels', 'arrows-relations', 'organization-conventions', 'legibility'] as const;
export type ScientificDiagramQualityDimension = typeof SCIENTIFIC_DIAGRAM_QUALITY_DIMENSIONS[number];
export type ScientificDiagramQualityStatus = 'fulfilled' | 'partial' | 'missing' | 'not-applicable' | 'uncertain';

export interface ScientificDiagramQualityAssessment {
  dimension: ScientificDiagramQualityDimension;
  status: ScientificDiagramQualityStatus;
  evidence: string;
}

export interface DiagramCriterionAssessment {
  criterionId: string;
  title: string;
  points: number;
  maxPoints: number;
  evidence: string;
  confidence: number;
  requiresTeacherReview: boolean;
  /** Detailed explanation for criteria explicitly marked as scientific-diagram. */
  qualityBreakdown?: ScientificDiagramQualityAssessment[];
}

export interface ScientificDiagramFinding {
  id: string;
  pageNumber: number;
  bounds?: { x: number; y: number; width: number; height: number };
  diagramType: string;
  summary: string;
  criteria: DiagramCriterionAssessment[];
  uncertainties: string[];
}

export interface ScientificDiagramAnalysis {
  diagrams: ScientificDiagramFinding[];
  overallUncertainties: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extract one complete JSON object from common local-model wrappers without relaxing schema validation. */
function extractModelJsonObject(raw: string): string {
  const withoutThinking = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = withoutThinking.replace(/^\u0060{3}(?:json)?\s*/i, '').replace(/\s*\u0060{3}$/, '');
  const start = fenced.indexOf('{');
  if (start < 0) return fenced;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < fenced.length; index += 1) {
    const character = fenced[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character.charCodeAt(0) === 92) escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return fenced.slice(start, index + 1);
    }
  }
  return fenced;
}

/** Parse and constrain model output against the teacher's actual rubric. */
export function parseScientificDiagramAnalysis(raw: string, rubric: Rubric, pageCount: number, allowedPageNumbers: number[] = Array.from({ length: pageCount }, (_, index) => index + 1)): ScientificDiagramAnalysis {
  const cleaned = extractModelJsonObject(raw);
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); }
  catch { throw new Error('La réponse du modèle Vision n’est pas un JSON valide.'); }
  if (!isRecord(parsed) || !Array.isArray(parsed.diagrams)) {
    const receivedKeys = isRecord(parsed) ? Object.keys(parsed).join(', ') || 'aucune' : Array.isArray(parsed) ? 'tableau JSON' : typeof parsed;
    throw new Error(`La réponse Vision ne contient pas la liste obligatoire "diagrams" (clés reçues : ${receivedKeys}). Consultez la réponse brute dans les diagnostics.`);
  }
  // Global uncertainties are helpful context, but they must not invalidate
  // otherwise usable diagram scores when a Vision model omits this optional field.
  const overallUncertainties = parsed.overallUncertainties ?? [];
  if (!Array.isArray(overallUncertainties) || !overallUncertainties.every((item) => typeof item === 'string')) {
    throw new Error('Les incertitudes globales de Vision doivent être une liste de textes.');
  }
  const rubricCriteria = new Map(rubric.criteria.map((criterion) => [criterion.id, criterion]));
  const ids = new Set<string>();
  const diagrams = parsed.diagrams.map((value, index): ScientificDiagramFinding => {
    if (!isRecord(value)) throw new Error(`Le schéma ${index + 1} est invalide.`);
    const reportedPageNumber = value.pageNumber;
    if (!Number.isInteger(reportedPageNumber) || Number(reportedPageNumber) < 1 || Number(reportedPageNumber) > pageCount) {
      throw new Error(`Le schéma ${index + 1} référence un index d’image invalide (numéro retourné : ${String(reportedPageNumber)}).`);
    }
    // Vision always returns a 1-based index in the filtered image batch.
    // Resolve it unconditionally: a local index may coincidentally equal a
    // different original page number (for example local page 2 vs original page 2).
    const pageNumber = allowedPageNumbers[Number(reportedPageNumber) - 1];
    if (pageNumber === undefined) {
      throw new Error(`Le schéma ${index + 1} ne peut pas être rattaché à une page originale.`);
    }
    if (typeof value.id !== 'string' || !value.id.trim() || ids.has(value.id)) throw new Error('Chaque schéma doit avoir un identifiant unique.');
    ids.add(value.id);
    if (typeof value.diagramType !== 'string' || typeof value.summary !== 'string' || !Array.isArray(value.criteria) || !Array.isArray(value.uncertainties)) {
      throw new Error(`Le contenu du schéma ${value.id} est incomplet.`);
    }
    const criterionIds = new Set<string>();
    const criteria = value.criteria.map((item): DiagramCriterionAssessment => {
      if (!isRecord(item) || typeof item.criterionId !== 'string') throw new Error('Un résultat de critère est invalide.');
      if (criterionIds.has(item.criterionId)) throw new Error(`Le critère ${item.criterionId} est répété pour le schéma ${value.id}.`);
      criterionIds.add(item.criterionId);
      const expected = rubricCriteria.get(item.criterionId);
      if (!expected) throw new Error(`Le modèle a retourné un critère absent du barème : ${item.criterionId}.`);
      if (typeof item.points !== 'number' || !Number.isFinite(item.points) || item.points < 0 || item.points > expected.maxPoints) {
        throw new Error(`La note proposée pour « ${expected.title} » dépasse les limites du barème.`);
      }
      if (typeof item.evidence !== 'string' || typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1 || typeof item.requiresTeacherReview !== 'boolean') {
        throw new Error(`Les éléments de preuve du critère « ${expected.title} » sont invalides.`);
      }
      let qualityBreakdown: ScientificDiagramQualityAssessment[] | undefined;
      if (Array.isArray(item.qualityBreakdown)) {
        const byDimension = new Map<ScientificDiagramQualityDimension, ScientificDiagramQualityAssessment>();
        for (const entry of item.qualityBreakdown) {
          if (!isRecord(entry) || typeof entry.dimension !== 'string' || !SCIENTIFIC_DIAGRAM_QUALITY_DIMENSIONS.includes(entry.dimension as ScientificDiagramQualityDimension)) continue;
          const dimension = entry.dimension as ScientificDiagramQualityDimension;
          if (byDimension.has(dimension)) continue;
          const status = ['fulfilled', 'partial', 'missing', 'not-applicable', 'uncertain'].includes(String(entry.status))
            ? entry.status as ScientificDiagramQualityStatus
            : 'uncertain';
          const evidence = typeof entry.evidence === 'string' && entry.evidence.trim()
            ? entry.evidence.trim()
            : 'Le modèle n’a pas fourni de justification exploitable pour cette dimension.';
          byDimension.set(dimension, { dimension, status, evidence });
        }
        qualityBreakdown = SCIENTIFIC_DIAGRAM_QUALITY_DIMENSIONS.map((dimension) => byDimension.get(dimension) ?? ({
          dimension,
          status: 'uncertain',
          evidence: 'Détail non fourni par le modèle ; cette absence ne modifie pas la note globale.',
        }));
      }
      return { criterionId: expected.id, title: expected.title, points: item.points, maxPoints: expected.maxPoints, evidence: item.evidence, confidence: item.confidence, requiresTeacherReview: item.requiresTeacherReview, ...(qualityBreakdown ? { qualityBreakdown } : {}) };
    });
    let bounds: ScientificDiagramFinding['bounds'];
    if (value.bounds !== undefined) {
      const rawBounds = value.bounds;
      if (!isRecord(rawBounds) || !['x', 'y', 'width', 'height'].every((key) => typeof rawBounds[key] === 'number')) {
        throw new Error(`Les coordonnées du schéma ${value.id} sont invalides.`);
      }
      const box = rawBounds as Record<string, number>;
      if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 || box.x + box.width > 1 || box.y + box.height > 1) {
        throw new Error(`Les coordonnées du schéma ${value.id} sortent de la page.`);
      }
      bounds = { x: box.x, y: box.y, width: box.width, height: box.height };
    }
    if (!value.uncertainties.every((item) => typeof item === 'string')) throw new Error('Les incertitudes doivent être des textes.');
    return { id: value.id, pageNumber, ...(bounds ? { bounds } : {}), diagramType: value.diagramType, summary: value.summary, criteria, uncertainties: value.uncertainties as string[] };
  });
  return { diagrams, overallUncertainties: overallUncertainties as string[] };
}
