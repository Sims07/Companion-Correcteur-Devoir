import type { Rubric } from './rubric.ts';

export interface DiagramCriterionAssessment {
  criterionId: string;
  title: string;
  points: number;
  maxPoints: number;
  evidence: string;
  confidence: number;
  requiresTeacherReview: boolean;
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
export function parseScientificDiagramAnalysis(raw: string, rubric: Rubric, pageCount: number): ScientificDiagramAnalysis {
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
    if (!Number.isInteger(pageNumber) || Number(pageNumber) < 1 || Number(pageNumber) > pageCount) {
      throw new Error(`Le schéma ${index + 1} référence une page inexistante.`);
    }
    if (typeof value.id !== 'string' || !value.id.trim() || ids.has(value.id)) throw new Error('Chaque schéma doit avoir un identifiant unique.');
    ids.add(value.id);
    if (typeof value.diagramType !== 'string' || typeof value.summary !== 'string' || !Array.isArray(value.criteria) || !Array.isArray(value.uncertainties)) {
      throw new Error(`Le contenu du schéma ${value.id} est incomplet.`);
    }
    const criteria = value.criteria.map((item): DiagramCriterionAssessment => {
      if (!isRecord(item) || typeof item.criterionId !== 'string') throw new Error('Un résultat de critère est invalide.');
      const expected = rubricCriteria.get(item.criterionId);
      if (!expected) throw new Error(`Le modèle a retourné un critère absent du barème : ${item.criterionId}.`);
      if (typeof item.points !== 'number' || !Number.isFinite(item.points) || item.points < 0 || item.points > expected.maxPoints) {
        throw new Error(`La note proposée pour « ${expected.title} » dépasse les limites du barème.`);
      }
      if (typeof item.evidence !== 'string' || typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1 || typeof item.requiresTeacherReview !== 'boolean') {
        throw new Error(`Les éléments de preuve du critère « ${expected.title} » sont invalides.`);
      }
      return { criterionId: expected.id, title: expected.title, points: item.points, maxPoints: expected.maxPoints, evidence: item.evidence, confidence: item.confidence, requiresTeacherReview: item.requiresTeacherReview };
    });
    let bounds: ScientificDiagramFinding['bounds'];
    if (value.bounds !== undefined) {
      const rawBounds = value.bounds;
      if (!isRecord(rawBounds) || !['x', 'y', 'width', 'height'].every((key) => typeof rawBounds[key] === 'number')) {
        throw new Error(`Les coordonnées du schéma ${value.id} sont invalides.`);
      }
      const box = rawBounds as Record<string, number>;
      if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 || box.x + box.width > 1 || box.y + box.height > 1) {
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
