import type { CriterionProposal, GradingProposal } from './grading.ts';
import type { DiagramCriterionAssessment, ScientificDiagramAnalysis } from './scientificDiagram.ts';
import type { Rubric, RubricCriterion } from './rubric.ts';
import { getRubricSubcriteria } from './rubric.ts';
import { mergeScientificDiagramCriteria, partitionScientificRubric } from './scientificRubricRouting.ts';
import { normalizeGradeScore, sumGradeScores } from './scorePrecision.ts';

function sourceAssessments(analysis: ScientificDiagramAnalysis | null, criterionId: string): DiagramCriterionAssessment[] {
  // Global assessments take precedence; do not count global and page observations twice.
  return (analysis?.criteria ?? analysis?.diagrams.flatMap((diagram) => diagram.criteria))
    ?.filter((assessment) => assessment.criterionId === criterionId) ?? [];
}

function meaningfulVisualEvidence(value: string): boolean {
  const evidence = value.trim();
  return evidence.length > 0 && !/^(?:preuve non (?:fournie|disponible)|aucune preuve|illisible|non renseign[eé])/i.test(evidence);
}

function decisionFromVisualEvidence(
  criterion: RubricCriterion,
  analysis: ScientificDiagramAnalysis | null,
  fallback: CriterionProposal,
): CriterionProposal {
  const subcriteria = getRubricSubcriteria(criterion);
  if (subcriteria.length === 0) {
    // An undivided graphical criterion cannot be converted to binary points without
    // inventing a new teacher rubric. Retain the existing visual assessment.
    return fallback;
  }

  const assessments = sourceAssessments(analysis, criterion.id);
  const pending: string[] = [];
  const ratedElements = subcriteria.map((subcriterion) => {
    const observations = assessments.flatMap((assessment) => assessment.elements ?? [])
      .filter((element) => element.subcriterionId === subcriterion.id);
    const evidencedPresent = observations.find((element) =>
      element.status === 'present' && element.origin !== 'printed-subject'
      && element.origin !== 'uncertain' && meaningfulVisualEvidence(element.evidence));
    const allAbsent = observations.length > 0 && observations.every((element) => element.status === 'absent');
    const status: 'present' | 'absent' | 'partial' | 'uncertain' = evidencedPresent ? 'present'
      : allAbsent ? 'absent'
        : observations.some((element) => element.status === 'partial') ? 'partial'
          : 'uncertain';
    const points = status === 'present' ? normalizeGradeScore(subcriterion.maxPoints) : 0;
    const evidence = evidencedPresent?.evidence.trim()
      ?? observations.find((element) => meaningfulVisualEvidence(element.evidence))?.evidence.trim()
      ?? (allAbsent ? 'Élément non repéré sur le schéma.' : 'Preuve visuelle à vérifier.');

    // A copied printed title is not a student-drawn title, and a vaguely
    // uncertain image must not silently trigger a generic review of all criteria.
    const conflictingObservations = new Set(observations.map((element) => element.status)).size > 1;
    if (conflictingObservations) {
      pending.push(subcriterion.title + ' : observations contradictoires entre les pages.');
    } else if (status === 'partial' || status === 'uncertain') {
      // Never invent a biological explanation absent from the observations.
      const details = observations.find((item) => item.uncertainty?.trim())?.uncertainty?.trim()
        || (observations.some((item) => item.origin === 'printed-subject')
          ? 'preuve visible seulement dans le sujet imprimé'
          : status === 'partial'
            ? 'observation partielle à confirmer : ' + evidence
            : 'preuve insuffisante ou illisible : ' + evidence);
      pending.push(subcriterion.title + ' : ' + details + '.');
    }
    return {
      id: subcriterion.id, title: subcriterion.title, maxPoints: subcriterion.maxPoints,
      status, points, evidence,
    };
  });

  // A page-level warning from another scientific diagram must not invalidate
  // this criterion. Global warnings remain visible in the teacher questions,
  // but only observations linked to this criterion can block its points.
  const relevantDiagramIds = new Set(assessments.flatMap((assessment) => assessment.diagramIds ?? []));
  const relevantDiagrams = (analysis?.diagrams ?? []).filter((diagram) =>
    relevantDiagramIds.has(diagram.id));
  const visualDoubts = relevantDiagrams.flatMap((diagram) => diagram.uncertainties);
  const questionableAssessment = assessments.find((assessment) => assessment.requiresTeacherReview
    || !Number.isFinite(assessment.confidence) || assessment.confidence < 0.8);
  const globalImageDoubt = analysis?.overallUncertainties.find((item) =>
    /(?:orientation|photo\s+floue|image\s+floue|page\s+illisible|page\s+incompl[eè]te)/i.test(item));
  if (pending.length === 0 && (questionableAssessment || visualDoubts.length > 0 || globalImageDoubt)) {
    const specific = assessments.flatMap((assessment) => assessment.elements ?? [])
      .find((element) => element.uncertainty?.trim())?.uncertainty?.trim()
      || visualDoubts.find((item) => item.trim())?.trim()
      || globalImageDoubt?.trim()
      || (questionableAssessment && questionableAssessment.confidence < 0.8
        ? 'lecture incertaine (' + Math.round(questionableAssessment.confidence * 100) + ' % de confiance)'
        : 'confirmation demandée par Vision sur la preuve « '
          + (questionableAssessment?.evidence?.trim() || criterion.title) + ' »');
    pending.push(criterion.title + ' : ' + specific + '.');
  }
  const incomplete = pending.length > 0;
  const points = sumGradeScores(ratedElements.map((element) => element.points));
  const questionForTeacher = incomplete ? 'Sur le schéma, vérifiez : ' + pending.join(' ') : undefined;
  return {
    criterionId: criterion.id,
    points,
    rationale: incomplete
      ? 'Un ou plusieurs attendus précis nécessitent une vérification sur le dessin.'
      : points === criterion.maxPoints ? '' : 'Certains attendus du schéma sont absents.',
    evidence: ratedElements.find((element) => element.status === 'present')?.evidence
      ?? ratedElements[0]?.evidence ?? 'Preuve visuelle à vérifier.',
    confidence: incomplete ? 'low' : 'medium',
    assessmentStatus: incomplete ? 'not-evaluated' : 'evaluated',
    ...(questionForTeacher ? { questionForTeacher } : {}),
    ...(fallback.scientificDiagramPages ? { scientificDiagramPages: fallback.scientificDiagramPages } : {}),
    scientificDiagramElements: ratedElements.map((element) => ({
      label: element.title,
      status: element.status,
      points: element.points,
      maxPoints: element.maxPoints,
      evidence: element.evidence,
    })),
    subcriteria: ratedElements.map((element) => ({
      subcriterionId: element.id, title: element.title,
      points: element.points, maxPoints: element.maxPoints,
      evidence: element.evidence,
    })),
  };
}

/**
 * Hybrid diagram strategy: keep the existing Vision analysis and page/rubric routing,
 * but derive points from explicitly defined subcriteria and semantic decisions.
 * The classic diagram path is not changed. Visual uncertainty is never converted
 * into an automatic deduction. A given subcriterion can earn points only once.
 */
export function mergeDecisionScientificDiagramCriteria(
  rubric: Rubric,
  textProposal: GradingProposal | null,
  analysis: ScientificDiagramAnalysis | null,
): GradingProposal {
  const classic = mergeScientificDiagramCriteria(rubric, textProposal, analysis);
  const visualCriteria = new Map(partitionScientificRubric(rubric).diagramCriteria.map((item) => [item.id, item]));
  const criteria = classic.criteria.map((proposal) => {
    const visual = visualCriteria.get(proposal.criterionId);
    return visual ? decisionFromVisualEvidence(visual, analysis, proposal) : proposal;
  });
  const scoreIncomplete = criteria.some((item) => item.assessmentStatus === 'not-evaluated');
  const questionsForTeacher = [
    ...(textProposal?.questionsForTeacher ?? []),
    ...criteria.flatMap((criterion) => criterion.questionForTeacher ? [criterion.questionForTeacher] : []),
    ...(analysis?.overallUncertainties ?? []),
    ...(analysis?.warnings ?? []),
  ];
  return {
    ...classic,
    criteria,
    questionsForTeacher: [...new Set(questionsForTeacher)],
    scoreIncomplete,
    finalScore: sumGradeScores(criteria
      .filter((item) => item.assessmentStatus !== 'not-evaluated')
      .map((item) => item.points)),
    summary: scoreIncomplete
      ? 'Évaluation partielle : des critères restent à vérifier par le professeur.'
      : textProposal?.summary ?? 'Évaluation fondée sur les attendus du barème.',
  };
}
