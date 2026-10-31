import type { GradingProposal, CriterionProposal } from './grading.ts';
import type { Rubric, RubricCriterion } from './rubric.ts';
import type { ScientificDiagramAnalysis } from './scientificDiagram.ts';

export interface ScientificRubricPartition {
  textCriteria: RubricCriterion[];
  diagramCriteria: RubricCriterion[];
}

/** Routes explicit visual/scientific-representation criteria to image-based evaluation. */
export function partitionScientificRubric(rubric: Rubric): ScientificRubricPartition {
  const visualPattern = /\b(sch[eé]mas?|diagrammes?|dessins?|croquis|figures?|graphiques?|repr[eé]sentations? (?:graphiques?|visuelles?|sch[eé]matiques?)|planches? anatomiques?)\b/i;
  const legendPattern = /\bl[eé]gendes?\b/i;
  const diagramContextPattern = /\b(sch[eé]mas?|diagrammes?|dessins?|figures?|graphiques?|cellule|anatom(?:ie|ique)|coupe|voie m[eé]tabolique)\b/i;
  const diagramCriteria: RubricCriterion[] = [];
  const textCriteria: RubricCriterion[] = [];

  for (const criterion of rubric.criteria) {
    const wording = `${criterion.title} ${criterion.description}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isVisual = visualPattern.test(wording) || (legendPattern.test(wording) && diagramContextPattern.test(wording));
    (isVisual ? diagramCriteria : textCriteria).push(criterion);
  }
  return { textCriteria, diagramCriteria };
}

/** Merge Vision's visual assessments with text grading without double-evaluating visual criteria through OCR. */
export function mergeScientificDiagramCriteria(
  rubric: Rubric,
  textProposal: GradingProposal | null,
  analysis: ScientificDiagramAnalysis | null,
): GradingProposal {
  const { textCriteria, diagramCriteria } = partitionScientificRubric(rubric);
  const textById = new Map((textProposal?.criteria ?? []).map((criterion) => [criterion.criterionId, criterion]));
  const diagramProposals = new Map<string, CriterionProposal>();

  for (const criterion of diagramCriteria) {
    const assessments = (analysis?.diagrams ?? []).flatMap((diagram) =>
      diagram.criteria
        .filter((assessment) => assessment.criterionId === criterion.id)
        .map((assessment) => ({ ...assessment, pageNumber: diagram.pageNumber, diagramType: diagram.diagramType })),
    );
    if (assessments.length === 0) {
      diagramProposals.set(criterion.id, {
        criterionId: criterion.id,
        points: 0,
        rationale: 'Aucune évaluation visuelle exploitable n’a été produite pour ce critère.',
        evidence: 'Le critère porte sur un élément graphique ; aucune preuve visuelle fiable ne permet de proposer une note.',
        confidence: 'low',
        questionForTeacher: 'Vérifiez le schéma sur la copie et attribuez les points de ce critère.',
      });
      continue;
    }

    const points = Math.min(criterion.maxPoints, assessments.reduce((sum, item) => sum + item.points, 0) / assessments.length);
    const confidence = Math.min(...assessments.map((item) => item.confidence));
    const requiresTeacherReview = assessments.some((item) => item.requiresTeacherReview);
    const evidence = assessments.map((item) => `Page ${item.pageNumber} (${item.diagramType}) : ${item.evidence}`).join(' · ');
    diagramProposals.set(criterion.id, {
      criterionId: criterion.id,
      points,
      rationale: `Évaluation réalisée sur le ou les schémas visibles, conformément au critère « ${criterion.title} ».`,
      evidence,
      confidence: confidence < 0.5 ? 'low' : confidence < 0.8 ? 'medium' : 'high',
      ...(requiresTeacherReview ? { questionForTeacher: 'Un point de l’évaluation visuelle nécessite votre vérification sur la copie.' } : {}),
    });
  }

  const criteria = rubric.criteria.map((criterion) => diagramProposals.get(criterion.id) ?? textById.get(criterion.id));
  for (const criterion of textCriteria) {
    if (!textById.has(criterion.id)) {
      criteria.push({
        criterionId: criterion.id,
        points: 0,
        rationale: 'Aucune proposition textuelle reçue pour ce critère.',
        evidence: 'Une vérification enseignante est nécessaire.',
        confidence: 'low',
        questionForTeacher: 'Vérifiez ce critère et attribuez les points manuellement.',
      });
    }
  }

  const orderedCriteria = rubric.criteria
    .map((criterion) => criteria.find((item) => item?.criterionId === criterion.id))
    .filter((criterion): criterion is CriterionProposal => criterion !== undefined);
  const questionsForTeacher = [
    ...(textProposal?.questionsForTeacher ?? []),
    ...orderedCriteria.flatMap((criterion) => criterion.questionForTeacher ? [criterion.questionForTeacher] : []),
    ...(analysis?.overallUncertainties ?? []),
  ];
  return {
    summary: textProposal?.summary ?? 'Proposition fondée sur l’analyse visuelle des schémas ; vérification enseignante requise.',
    criteria: orderedCriteria,
    questionsForTeacher: [...new Set(questionsForTeacher)],
    finalScore: orderedCriteria.reduce((sum, criterion) => sum + criterion.points, 0),
  };
}
