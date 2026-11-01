import type { GradingProposal, CriterionProposal } from './grading.ts';
import type { Rubric, RubricCriterion } from './rubric.ts';
import type { ScientificDiagramAnalysis, ScientificDiagramQualityStatus } from './scientificDiagram.ts';

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
    const isVisual = criterion.analysisMode === 'scientific-diagram' || (criterion.analysisMode !== 'text' && (visualPattern.test(wording) || (legendPattern.test(wording) && diagramContextPattern.test(wording))));
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
  const legacyAnalysis = Boolean(analysis && (!analysis.criteria || (analysis.warnings ?? []).some((warning) => warning.includes('Ancien format'))));

  for (const criterion of diagramCriteria) {
    const legacy = legacyAnalysis;
    const assessments = legacy
      ? (analysis?.diagrams ?? []).flatMap((diagram) => (diagram.criteria ?? []).filter((assessment) => assessment.criterionId === criterion.id).map((assessment) => ({ ...assessment, pageNumber: diagram.pageNumber, diagramType: diagram.diagramType })))
      : (analysis?.criteria ?? []).filter((assessment) => assessment.criterionId === criterion.id);
    if (assessments.length === 0) {
      diagramProposals.set(criterion.id, {
        criterionId: criterion.id,
        points: 0,
        rationale: 'Aucune évaluation visuelle exploitable n’a été produite pour ce critère.',
        evidence: 'À évaluer manuellement — aucune évaluation visuelle exploitable. Pages concernées : ' + ((analysis?.diagrams ?? []).map((diagram) => diagram.pageNumber).join(', ') || 'non identifiées') + '.',
        scientificDiagramPages: [...new Set((analysis?.diagrams ?? []).map((diagram) => diagram.pageNumber))],
        confidence: 'low',
        questionForTeacher: 'Vérifiez le schéma sur la copie et attribuez les points de ce critère.',
      });
      continue;
    }

    const points = legacy ? Math.min(criterion.maxPoints, assessments.reduce((sum, item) => sum + item.points, 0) / assessments.length) : assessments[0].points;
    const confidence = Math.min(...assessments.map((item) => item.confidence));
    const requiresTeacherReview = legacy || assessments.some((item) => item.requiresTeacherReview);
    const evidence = assessments.map((item) => item.evidence).join(' · ') + (legacy ? ' · Ancien format, vérifier la note.' : ` · Pages concernées : ${(analysis?.diagrams ?? []).filter((diagram) => (assessments[0].diagramIds ?? []).includes(diagram.id)).map((diagram) => diagram.pageNumber).join(', ')}`);
    const qualityBreakdown = criterion.analysisMode === 'scientific-diagram'
      ? (assessments[0].qualityBreakdown ?? []).map((dimension) => {
        const matching = assessments.flatMap((assessment) => (assessment.qualityBreakdown ?? []).filter((entry) => entry.dimension === dimension.dimension));
        const statuses = matching.map((entry) => entry.status);
        const status: ScientificDiagramQualityStatus = statuses.length === 0 ? 'uncertain'
          : statuses.every((value) => value === 'not-applicable') ? 'not-applicable'
          : statuses.includes('uncertain') ? 'uncertain'
          : statuses.every((value) => value === 'fulfilled') ? 'fulfilled'
          : statuses.every((value) => value === 'missing') ? 'missing'
          : statuses.every((value) => value === 'partial') ? 'partial'
          : statuses.includes('missing') || statuses.includes('partial') ? 'partial'
          : 'fulfilled';
        return { ...dimension, status, evidence: matching.map((entry) => entry.evidence).join(' · ') };
      })
      : undefined;
    diagramProposals.set(criterion.id, {
      criterionId: criterion.id,
      points,
      rationale: `Évaluation réalisée sur le ou les schémas visibles, conformément au critère « ${criterion.title} ».`,
      evidence,
      ...(qualityBreakdown ? { qualityBreakdown } : {}),
      ...(assessments[0].elements ? { scientificDiagramElements: assessments[0].elements } : {}),
      scientificDiagramPages: [...new Set(assessments.flatMap((assessment) => (analysis?.diagrams ?? []).filter((diagram) => (assessment.diagramIds ?? []).includes(diagram.id)).map((diagram) => diagram.pageNumber)))],
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
    ...(analysis?.warnings ?? []),
    ...(legacyAnalysis ? ['Ancien format d’analyse par schéma : vérifier la note.'] : []),
  ];
  return {
    summary: textProposal?.summary ?? 'Proposition fondée sur l’analyse visuelle des schémas ; vérification enseignante requise.',
    criteria: orderedCriteria,
    questionsForTeacher: [...new Set(questionsForTeacher)],
    finalScore: orderedCriteria.reduce((sum, criterion) => sum + criterion.points, 0),
  };
}
