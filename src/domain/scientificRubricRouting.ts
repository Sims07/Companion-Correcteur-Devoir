import type { GradingProposal, CriterionProposal } from './grading.ts';
import type { Rubric, RubricCriterion } from './rubric.ts';
import type { DiagramCriterionAssessment, ScientificDiagramAnalysis } from './scientificDiagram.ts';
import { getRubricSubcriteria } from './rubric.ts';
import { normalizeGradeScore, sumGradeScores } from './scorePrecision.ts';

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

/** Merge visual evidence against the teacher rubric; never average independent page grades. */
export function mergeScientificDiagramCriteria(
  rubric: Rubric,
  textProposal: GradingProposal | null,
  analysis: ScientificDiagramAnalysis | null,
): GradingProposal {
  const { diagramCriteria } = partitionScientificRubric(rubric);
  const textById = new Map((textProposal?.criteria ?? []).map((criterion) => [criterion.criterionId, criterion]));
  const diagramProposals = new Map<string, CriterionProposal>();
  const legacyAnalysis = Boolean(analysis?.warnings?.some((warning) => warning.includes('Ancien format'))
    || (analysis && !analysis.criteria
      && analysis.diagrams.some((diagram) => (diagram.criteria ?? []).length > 0)
      && !(analysis.warnings ?? []).some((warning) => warning.startsWith('Évaluations page par page'))));
  const pageLevelAnalysis = Boolean(analysis && !analysis.criteria
    && analysis.warnings?.some((warning) => warning.startsWith('Évaluations page par page')));
  const perPage = legacyAnalysis || pageLevelAnalysis;
  const diagramPages = [...new Set((analysis?.diagrams ?? []).map((diagram) => diagram.pageNumber))];

  const unevaluated = (criterion: RubricCriterion, pages: number[], reason: string): CriterionProposal => ({
    criterionId: criterion.id,
    points: 0, // Type-safe placeholder only: excluded from finalScore and never displayed as an awarded zero.
    assessmentStatus: 'not-evaluated',
    rationale: reason,
    evidence: `Évaluation non disponible. Pages concernées : ${pages.join(', ') || 'non identifiées'}.`,
    scientificDiagramPages: pages,
    confidence: 'low',
    questionForTeacher: `Évaluez manuellement « ${criterion.title} » sur la copie : ${reason}`,
  });

  for (const criterion of diagramCriteria) {
    const assessments: DiagramCriterionAssessment[] = perPage
      ? (analysis?.diagrams ?? []).flatMap((diagram) => (diagram.criteria ?? [])
        .filter((assessment) => assessment.criterionId === criterion.id))
      : (analysis?.criteria ?? []).filter((assessment) => assessment.criterionId === criterion.id);
    if (assessments.length === 0) {
      diagramProposals.set(criterion.id, unevaluated(criterion, diagramPages, 'aucune évaluation visuelle exploitable'));
      continue;
    }

    const sourcePages = [...new Set(assessments.flatMap((assessment) =>
      (analysis?.diagrams ?? []).filter((diagram) => (assessment.diagramIds ?? []).includes(diagram.id)).map((diagram) => diagram.pageNumber),
    ))];
    const pages = sourcePages.length > 0 ? sourcePages : diagramPages;
    const configuredSubcriteria = getRubricSubcriteria(criterion);
    const assessmentEvidence = [...new Set(assessments.map((assessment) => assessment.evidence.trim()).filter(Boolean))];
    let points = Number.NaN;
    let elements: NonNullable<DiagramCriterionAssessment['elements']> | undefined;
    let assessmentIncomplete = false;
    let mismatch = false;

    if (configuredSubcriteria.length > 0) {
      // Evaluate each teacher-defined dimension once. Page-level observations may
      // complement one another, but the same element can never earn points twice.
      const aggregated = configuredSubcriteria.map((expected) => {
        const candidates = assessments.flatMap((assessment) => assessment.elements ?? [])
          .filter((element) => element.subcriterionId === expected.id
            || element.label.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim()
              === expected.title.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim());
        const supported = candidates.filter((element) =>
          Number.isFinite(element.points)
          && element.points >= 0
          && element.points <= expected.maxPoints
          && element.maxPoints === expected.maxPoints
          && element.status !== 'uncertain'
          && Boolean(element.evidence.trim())
          && element.evidence !== 'Preuve non fournie par le modèle',
        );
        if (!supported.length) return null;
        const selected = perPage
          ? supported.reduce((best, item) => item.points > best.points ? item : best)
          : supported[0];
        return {
          ...selected,
          label: expected.title,
          maxPoints: expected.maxPoints,
          points: normalizeGradeScore(selected.points),
          evidence: [...new Set(supported.map((item) => item.evidence.trim()))].join(' · '),
        };
      });
      if (aggregated.some((element) => element === null)) {
        assessmentIncomplete = true;
      } else {
        elements = aggregated.filter((element): element is NonNullable<typeof element> => element !== null);
        points = sumGradeScores(elements.map((element) => element.points));
        // In the global format the model supplies one single rubric assessment.
        mismatch = assessments.some((assessment) => assessment.elements
          && Math.abs(sumGradeScores(assessment.elements.map((element) => element.points)) - assessment.points) > 0.0001)
          || (!perPage && Math.abs(points - assessments[0].points) > 0.0001);
      }
    } else if (perPage && assessments.length > 1) {
      // Whole-criterion scores from separate pages cannot be mathematically
      // combined or averaged: another page may complete the previous answer.
      assessmentIncomplete = true;
    } else {
      points = normalizeGradeScore(assessments[0].points);
    }

    if (assessmentIncomplete || !Number.isFinite(points) || points < Math.min(0, criterion.maxPoints)
      || points > Math.max(0, criterion.maxPoints)) {
      diagramProposals.set(criterion.id, unevaluated(criterion, pages,
        configuredSubcriteria.length > 0
          ? 'preuves insuffisantes pour un ou plusieurs sous-critères du barème'
          : 'les notes des différentes pages ne peuvent être consolidées sans inventer de règle'));
      continue;
    }

    const confidence = Math.min(...assessments.map((assessment) => assessment.confidence));
    const needsReview = perPage || mismatch || assessments.some((assessment) => assessment.requiresTeacherReview);
    const questionForTeacher = mismatch
      ? 'La note annoncée ne correspond pas à la somme des sous-critères : vérifiez les éléments relevés.'
      : perPage ? 'Vérifiez la consolidation des preuves réparties sur plusieurs pages.' : needsReview
        ? 'Un point de l’évaluation visuelle nécessite votre vérification sur la copie.' : undefined;
    const evidence = [
      ...assessmentEvidence,
      `Pages concernées : ${pages.join(', ') || 'non identifiées'}`,
      ...(mismatch ? ['La somme des sous-critères ne correspond pas à la note annoncée.'] : []),
    ].join(' · ');
    diagramProposals.set(criterion.id, {
      criterionId: criterion.id,
      points,
      rationale: `Évaluation des éléments observés pour « ${criterion.title} », selon le barème fourni.`,
      evidence,
      ...(elements ? {
        subcriteria: elements.map((element) => ({
          subcriterionId: element.subcriterionId,
          title: element.label,
          points: element.points,
          maxPoints: element.maxPoints,
          evidence: element.evidence,
        })),
        scientificDiagramElements: elements,
      } : {}),
      scientificDiagramPages: pages,
      confidence: confidence < 0.5 ? 'low' : confidence < 0.8 ? 'medium' : 'high',
      ...(questionForTeacher ? { questionForTeacher } : {}),
    });
  }

  const orderedCriteria: CriterionProposal[] = rubric.criteria.map((criterion) => {
    const visual = diagramProposals.get(criterion.id);
    if (visual) return visual;
    const textual = textById.get(criterion.id);
    if (textual) return textual;
    return unevaluated(criterion, [], 'aucune proposition reçue pour ce critère du barème');
  });
  const scoreIncomplete = orderedCriteria.some((criterion) => criterion.assessmentStatus === 'not-evaluated');
  const questionsForTeacher = [
    ...(textProposal?.questionsForTeacher ?? []),
    ...orderedCriteria.flatMap((criterion) => criterion.questionForTeacher ? [criterion.questionForTeacher] : []),
    ...(analysis?.overallUncertainties ?? []),
    ...(analysis?.warnings ?? []),
    ...(legacyAnalysis ? ['Ancien format d’analyse par schéma : vérifier les résultats.'] : []),
  ];
  return {
    summary: scoreIncomplete
      ? 'Évaluation partielle : des critères restent à noter par le professeur.'
      : textProposal?.summary ?? 'Proposition fondée sur les preuves des schémas, à vérifier.',
    criteria: orderedCriteria,
    questionsForTeacher: [...new Set(questionsForTeacher)],
    finalScore: sumGradeScores(orderedCriteria.filter((criterion) => criterion.assessmentStatus !== 'not-evaluated').map((criterion) => criterion.points)),
    scoreIncomplete,
  };
}


/** Scientific diagram routing is a teacher workflow, independent of the configured AI provider. */
export function shouldRunTeacherScientificDiagramWorkflow(interfaceMode: string): boolean {
  return interfaceMode === 'teacher';
}
