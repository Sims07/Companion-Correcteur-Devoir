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

/** Parse and constrain model output against the teacher's actual rubric. */
export function parseScientificDiagramAnalysis(raw: string, rubric: Rubric, pageCount: number, allowedPageNumbers: number[] = Array.from({ length: pageCount }, (_, index) => index + 1)): ScientificDiagramAnalysis {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); }
  catch { throw new Error('La réponse du modèle Vision n’est pas un JSON valide.'); }
  if (!isRecord(parsed) || !Array.isArray(parsed.diagrams) || !Array.isArray(parsed.overallUncertainties)) {
    throw new Error('La réponse Vision ne respecte pas le contrat d’analyse des schémas.');
  }
  const rubricCriteria = new Map(rubric.criteria.map((criterion) => [criterion.id, criterion]));
  const ids = new Set<string>();
  const diagrams = parsed.diagrams.map((value, index): ScientificDiagramFinding => {
    if (!isRecord(value)) throw new Error(`Le schéma ${index + 1} est invalide.`);
    const pageNumber = value.pageNumber;
    if (!Number.isInteger(pageNumber) || !allowedPageNumbers.includes(Number(pageNumber))) {
      throw new Error(`Le schéma ${index + 1} référence une page inexistante.`);
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
      if (item.qualityBreakdown !== undefined || expected.analysisMode === 'scientific-diagram') {
        if (!Array.isArray(item.qualityBreakdown)) throw new Error(`Le détail de qualité du schéma est absent pour « ${expected.title} ».`);
        const seenDimensions = new Set<string>();
        qualityBreakdown = item.qualityBreakdown.map((entry): ScientificDiagramQualityAssessment => {
          if (!isRecord(entry) || typeof entry.dimension !== 'string' || !SCIENTIFIC_DIAGRAM_QUALITY_DIMENSIONS.includes(entry.dimension as ScientificDiagramQualityDimension) || seenDimensions.has(entry.dimension)) {
            throw new Error(`Une dimension de qualité est invalide ou répétée pour « ${expected.title} ».`);
          }
          seenDimensions.add(entry.dimension);
          if (!['fulfilled', 'partial', 'missing', 'not-applicable', 'uncertain'].includes(String(entry.status)) || typeof entry.evidence !== 'string') {
            throw new Error(`L'évaluation d'une dimension est invalide pour « ${expected.title} ».`);
          }
          return { dimension: entry.dimension as ScientificDiagramQualityDimension, status: entry.status as ScientificDiagramQualityStatus, evidence: entry.evidence };
        });
        if (qualityBreakdown.length !== SCIENTIFIC_DIAGRAM_QUALITY_DIMENSIONS.length || SCIENTIFIC_DIAGRAM_QUALITY_DIMENSIONS.some((dimension) => !seenDimensions.has(dimension))) {
          throw new Error(`Le détail de qualité doit couvrir les sept dimensions pour « ${expected.title} ».`);
        }
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
    return { id: value.id, pageNumber: Number(pageNumber), ...(bounds ? { bounds } : {}), diagramType: value.diagramType, summary: value.summary, criteria, uncertainties: value.uncertainties as string[] };
  });
  if (!parsed.overallUncertainties.every((item) => typeof item === 'string')) throw new Error('Les incertitudes globales doivent être des textes.');
  return { diagrams, overallUncertainties: parsed.overallUncertainties as string[] };
}
