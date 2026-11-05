import { getRubricSubcriteria } from '../../../domain/rubric.ts';
import type { ScientificDiagramAnalysisRequest } from '../../../ports/scientificDiagramAnalysis.ts';

/** Prompt builders for classification, scientific criteria, retry and response repair. */
export function classificationPrompt(pageNumber: number, previousRaw = '', repairReason = ''): string {
  return [
    `RÔLE : Classer la page ${pageNumber} pour la détection des schémas et indiquer une éventuelle rotation horaire à appliquer à toute la page.`,
    ['kind=text : texte manuscrit, réponse rédigée, liste ou tableau de données ; kind=scientific-diagram : schéma scientifique dessiné par l’étudiant.','kind=mixed : schéma scientifique et texte/tableau présents ensemble.','kind=ambiguous : contenu impossible à classer avec confiance.'].join('\n'),
    ['FORMAT DE SORTIE','Réponds UNIQUEMENT par un objet JSON, sans texte avant ni après, sans Markdown.','Champs obligatoires : pageNumber (entier), kind (text | scientific-diagram | mixed | ambiguous), confidence (nombre de 0 à 1), reason (une phrase courte), suggestedRotation (0 | 90 | 180 | 270, rotation horaire à appliquer ; 0 si la page est droite ou en cas de doute), orientationConfidence (nombre de 0 à 1).','Un tableau seul est text. Ne propose une rotation non nulle que si toute la page est tournée ; ne tourne pas une page pour un dessin isolé en paysage. La rotation est indépendante du type de contenu et concerne toujours la page entière. Toute rotation est une suggestion à valider par le professeur.',...(repairReason ? [`Erreur à corriger : ${repairReason.slice(0, 240)}. Réponse précédente à réparer : ${(previousRaw || '[réponse vide]').slice(0, 1500)}. Corrige le JSON sans inventer de contenu.`] : []),'Exemple neutre : {"pageNumber":1,"kind":"text","confidence":0.9,"reason":"texte manuscrit","suggestedRotation":0,"orientationConfidence":0.9}.'].join('\n'),
  ].join('\n\n');
}
export function buildScientificDiagramPrompt(request: ScientificDiagramAnalysisRequest): string {
  const pageNumber = request.pageNumbers?.[0] ?? 1;
  const criteria = request.rubric.criteria.map((criterion) => ({
    criterionId: criterion.id,
    title: criterion.title,
    description: criterion.description,
    maxPoints: criterion.maxPoints,
    subcriteria: getRubricSubcriteria(criterion),
  }));
  const subject = request.subjectTranscription?.trim();
  return [
    `Analyser les schémas de la page ${pageNumber} d’une copie universitaire. Une requête correspond toujours à une seule image ; un schéma est une preuve, jamais une unité de notation.`,
    'La classification préalable suggère un schéma, mais elle peut être erronée. Vérifie l’image : si aucun schéma n’est identifiable, retourne diagrams: [], criteria: [] et explique brièvement pourquoi dans overallUncertainties. N’invente jamais de dessin ou de note.',
    'Retourne diagrams : tous les schémas détectés sur cette page, avec id neutre, pageNumber = 1, diagramType, summary court, bounds et uncertainties (tableau). Le champ bounds est obligatoire : retourne null si la localisation est incertaine.',
    'Si un schéma est identifiable, retourne criteria : exactement UNE évaluation pour CHAQUE critère du barème, portant sur l’ensemble des schémas pertinents de CETTE PAGE uniquement. Ne note jamais un critère séparément par schéma et ne répartis pas son maximum entre les schémas. En l’absence de schéma identifiable, retourne criteria: [] et une incertitude explicite.',
    'Le maximum n’est justifié que si tous les attendus essentiels sont démontrés sur l’ensemble des schémas de cette page. Si un élément essentiel est partiel ou manquant, attribue des points partiels.',
    'Le champ elements est toujours présent : retourne chaque sous-critère du barème avec son intitulé exact, son statut, une preuve courte et les points attribués. Les points peuvent être partiels et doivent respecter le maximum propre au sous-critère ; ne déduis jamais automatiquement un demi-point.',
    'Si le critère ne contient aucun sous-critère, retourne une seule note points sur son maximum. Ne retourne jamais de critère absent du barème.',
    'Ne pénalise pas deux fois la même erreur. Ne juge jamais la beauté subjective du dessin. Si le barème demande explicitement la qualité graphique scientifique (lisibilité des traits, distinction des structures, cohérence spatiale ou légendes), évalue uniquement ces propriétés observables, jamais le goût esthétique. N’invente aucun attendu absent de la consigne ou du barème.',
    'Ne juge jamais un dessin correct à partir d’une explication textuelle. Si un élément est illisible ou ambigu, signale-le dans uncertainties et mets requiresTeacherReview à true.',
    'Les bounds sont normalisées de 0 à 1 ; retourne null si elles sont incertaines. Ne considère pas les tableaux de données comme des schémas.',
    'Ignore les marques de correction manuscrites préexistantes (commentaires, coches, cercles, notes et traits) : elles ne font jamais partie de la production de l’étudiant. Si une marque recouvre ou touche un élément du schéma, mets requiresTeacherReview à true.',
    'CRITÈRES VISUELS (liste exhaustive) : ' + JSON.stringify(criteria),
    'QUESTION : ' + (request.question.trim() || 'Aucune question de référence fournie.'),
    ...(subject ? ['SUJET DE RÉFÉRENCE (transcription fournie) : ' + subject] : []),
    'CORRESPONDANCE DES PAGES : ' + (request.pageNumbers ?? request.images.map((_, index) => index + 1)).map((page, index) => (index + 1) + ' → ' + page).join(', '),
    ['FORMAT DE SORTIE', 'Réponds UNIQUEMENT par un objet JSON, sans texte avant ni après, sans Markdown. Respecte le schéma JSON contraint transmis avec la requête. Les notes sont des nombres et restent dans les limites du barème ; n’invente aucune note.', 'Exemple neutre : {"diagrams":[{"id":"diagram-1","pageNumber":1,"diagramType":"schéma","summary":"Description courte.","uncertainties":[],"bounds":null}],"criteria":[{"criterionId":"criterion-id","points":0,"evidence":"Extrait exact.","confidence":0.5,"requiresTeacherReview":true,"diagramIds":[],"elements":null}],"overallUncertainties":[]}'].join('\n'),
  ].filter(Boolean).join('\n\n');
}

export function buildScientificDiagramRepairPrompt(
  request: ScientificDiagramAnalysisRequest,
  reason: string,
  previousRaw: string,
): string {
  return [
    buildScientificDiagramPrompt(request),
    'Réparer la réponse d’analyse des schémas : une classification préalable n’est pas une preuve de schéma. Si aucun dessin n’est identifiable, utilise diagrams: [], criteria: [] et overallUncertainties non vide ; sinon évalue chaque critère graphique du barème.',
    'Corrige précisément ce champ : ' + reason + '.',
    'Réponse précédente (extrait) : ' + previousRaw.slice(0, 3000),
    'FORMAT DE SORTIE : réponds UNIQUEMENT par un objet JSON, sans texte avant ni après, sans Markdown. Retourne le JSON complet conforme au schéma. Exemple neutre : {"diagrams":[{"id":"diagram-1","pageNumber":1,"diagramType":"schéma","summary":"Description courte.","uncertainties":[],"bounds":null}],"criteria":[{"criterionId":"criterion-id","points":0,"evidence":"Extrait exact.","confidence":0.5,"requiresTeacherReview":true,"diagramIds":[],"elements":null}],"overallUncertainties":[]}.',
  ].join('\n\n');
}

/** A genuinely smaller second request after token-budget exhaustion.
 * Keep the rubric and subject, but remove explanatory instructions and verbose examples.
 */
export function buildConciseScientificDiagramPrompt(request: ScientificDiagramAnalysisRequest): string {
  const criteria = request.rubric.criteria.map((criterion) => ({
    id: criterion.id,
    maxPoints: criterion.maxPoints,
    subcriteria: getRubricSubcriteria(criterion).map((item) => ({ id: item.id, maxPoints: item.maxPoints })),
  }));
  return [
    'RÔLE : évalue uniquement les schémas scientifiques réellement visibles sur cette image à partir du barème fourni.',
    'La réponse précédente était tronquée : produis une réponse beaucoup plus courte. summary ≤ 10 mots ; evidence et chaque preuve de sous-critère ≤ 8 mots ; uncertainties ≤ 8 mots par entrée. Pas de reformulation ni de justification longue.',
    'Si aucun schéma identifiable, retourne diagrams: [], criteria: [] et une explication courte dans overallUncertainties. N’invente ni schéma ni point.',
    'Si un schéma est identifiable, retourne un critère par id du barème, tous les sous-critères prévus et des points justifiés. Un dessin n’est pas une unité de notation. PageNumber = 1, bounds = null si localisation incertaine. La qualité graphique scientifique se note seulement si elle figure explicitement au barème, jamais la beauté subjective.',
    'BARÈME : ' + JSON.stringify(criteria),
    'QUESTION : ' + request.question,
    ...(request.subjectTranscription ? ['SUJET : ' + request.subjectTranscription] : []),
    'FORMAT DE SORTIE : réponds UNIQUEMENT par un objet JSON conforme au schéma transmis, sans Markdown, sans texte autour.',
  ].join('\n\n');
}

