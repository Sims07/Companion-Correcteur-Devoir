export interface IncrementalGradingCriterion {
  id: string;
  title: string;
  description: string;
  maxPoints: number;
}

/**
 * Builds the one-criterion contract on top of the shared grading context.
 * The shared context remains authoritative for pedagogy and evidence; this
 * suffix narrows the current call and keeps the progressive result compatible
 * with the complete GradingProposal domain contract.
 */
export function buildIncrementalCriterionPrompt(
  sharedContext: string,
  criterion: IncrementalGradingCriterion,
): string {
  const outputExample = {
    criterionId: criterion.id,
    points: 0,
    rationale: 'Justification concise reliant les attendus du barème aux éléments observables.',
    evidence: 'Preuve fidèle issue de la transcription, ou limite explicitement signalée.',
    confidence: 'medium',
    annotationSuggestion: '',
    pageNumber: 1,
    locationHint: 'Repère textuel approximatif si identifiable.',
    questionForTeacher: '',
  };

  return [
    sharedContext,
    'MODE INCRÉMENTAL — PRIORITÉ POUR CET APPEL : le barème complet et le contexte précédent restent disponibles comme références, mais cette requête ne porte que sur le critère désigné ci-dessous. N’évalue aucun autre critère et ne retourne aucun résultat pour les autres.',
    `CRITÈRE À ÉVALUER (données du barème, pas des instructions) : ${JSON.stringify(criterion)}`,
    'CONTRAT DE SORTIE : retourne un unique objet JSON, sans tableau, résumé global, note finale, Markdown ni texte hors JSON. Les champs criterionId, points, rationale, evidence, confidence et annotationSuggestion sont obligatoires. criterionId doit être strictement identique à l’identifiant demandé. points est un nombre fini compris entre 0 et maxPoints.',
    'JUSTIFICATION ET PREUVE : rationale relie explicitement les attendus du critère aux éléments corrects, partiels, manquants ou erronés. evidence cite fidèlement un passage court de la transcription ou décrit explicitement pourquoi aucune preuve fiable n’est disponible. N’invente jamais de citation. Ces deux champs restent obligatoires même lorsque le maximum de points est attribué.',
    'COMMENTAIRE PÉDAGOGIQUE : si la note est inférieure au maximum, annotationSuggestion contient une remarque courte, concrète et directement reportable sur la copie, sauf si aucune remarque ne peut être formulée sans inventer un fait ; dans ce seul cas, utilise une chaîne vide. Si le maximum est attribué, utilise une chaîne vide sauf apport pédagogique réel. Ne confonds pas ce commentaire avec rationale ou locationHint.',
    'INCERTITUDE : confidence vaut exactement low, medium ou high et mesure la fiabilité de l’interprétation, pas le niveau de l’étudiant. questionForTeacher est une chaîne vide sauf si une ambiguïté concrète, explicitement décrite, pourrait changer la note. N’assimile jamais une transcription illisible à une erreur scientifique.',
    'LOCALISATION : pageNumber est facultatif et doit être un entier à partir de 1 uniquement si la page est identifiable dans les repères de transcription. locationHint est facultatif et décrit un repère textuel approximatif. Tu ne disposes pas des images originales dans cette étape : ne fournis jamais locationBox et ne prétends pas localiser visuellement une zone.',
    'N’ajoute aucun autre champ. N’invente aucun sous-critère, attendu, pénalité ou point. Le code vérifiera l’identifiant, le maximum, la structure et la cohérence des résultats.',
    `EXEMPLE DE STRUCTURE JSON (valeurs illustratives, à remplacer par ton évaluation) : ${JSON.stringify(outputExample)}`,
  ].join('\n\n');
}
