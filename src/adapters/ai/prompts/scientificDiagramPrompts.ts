import { SCIENTIFIC_DIAGRAM_OBSERVATION_RULES } from '../../../domain/scientificDiagramObservation.ts';
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
    SCIENTIFIC_DIAGRAM_OBSERVATION_RULES,
    'La classification préalable suggère un schéma, mais elle peut être erronée. Vérifie l’image : si aucun schéma n’est identifiable, retourne diagrams: [], criteria: [] et explique brièvement pourquoi dans overallUncertainties. N’invente jamais de dessin ou de note.',
    'Retourne diagrams : les ensembles scientifiques distincts sur la page (les quatre phases d’une même mitose forment UN ensemble), id neutre, pageNumber = 1, diagramType, summary de 12 mots maximum, uncertainties (tableau). Aucune coordonnée numérique à générer ; une position relative utile à la preuve est autorisée.',
    'Si un schéma est identifiable, retourne exactement UNE évaluation par critère du barème, sur l’ensemble de la page. Ne note jamais un critère par dessin ou par phase. Sans dessin identifiable, criteria: [] et une incertitude explicite.',
    'Le maximum n’est justifié que si tous les attendus essentiels sont démontrés sur l’ensemble des schémas de cette page. Si un élément essentiel est partiel ou manquant, attribue des points partiels.',
    'Pour chaque sous-critère, observe d’abord ce que l’étudiant a réellement dessiné ou écrit sur cette page ; donne une preuve visuelle courte (structure, texte exact, position), puis le statut. Renseigne origin=student-diagram uniquement lorsque la preuve vient du dessin de l’étudiant, origin=printed-subject si elle n’est visible que dans l’énoncé imprimé, origin=uncertain sinon. Remplis uncertainty avec une raison concrète si l’observation est douteuse, sinon chaîne vide.',
    'Le champ elements contient chaque sous-critère du professeur, son label exact, statut, points et preuve visuelle de 20 mots maximum, décrivant la relation constatée plutôt que l’attendu. Les points partiels sont autorisés, ne déduis jamais automatiquement un demi-point. Un élément imprimé ou incertain ne rapporte aucun point. Ne répète pas le barème dans evidence.',
    'Différencie le titre global du schéma des étiquettes des phases (prophase, métaphase, anaphase, télophase) : une légende de phase ne constitue pas à elle seule un titre global. N’invente pas un titre absent, vérifie emplacement et lisibilité uniquement si le barème les demande.' ,
    'Si le critère ne contient aucun sous-critère, retourne une seule note points sur son maximum. Ne retourne jamais de critère absent du barème.',
    'Ne pénalise pas deux fois la même erreur. Ne juge jamais la beauté subjective du dessin. Si le barème demande explicitement la qualité graphique scientifique (lisibilité des traits, distinction des structures, cohérence spatiale ou légendes), évalue uniquement ces propriétés observables, jamais le goût esthétique. N’invente aucun attendu absent de la consigne ou du barème.',
    'Ne juge jamais un dessin correct à partir d’une explication textuelle. Si un élément est illisible ou ambigu, signale-le dans uncertainties et mets requiresTeacherReview à true.',
    'Ne considère pas les tableaux de données comme des schémas. Limite evidence du critère à 20 mots et uncertainty à 12 mots ; les longs résumés répétés risquent de tronquer la correction.',
    'Ignore uniquement les marques identifiées comme corrections professorales préexistantes. Ne supprime pas une structure étudiante parce qu’elle est entourée, barrée ou en couleur ; si l’origine est douteuse, signale cette incertitude. Si une marque recouvre ou touche un élément du schéma, mets requiresTeacherReview à true.',
    'CRITÈRES VISUELS (liste exhaustive) : ' + JSON.stringify(criteria),
    'QUESTION : ' + (request.question.trim() || 'Aucune question de référence fournie.'),
    ...(subject ? ['SUJET DE RÉFÉRENCE (transcription fournie) : ' + subject] : []),
    'CORRESPONDANCE DES PAGES : ' + (request.pageNumbers ?? request.images.map((_, index) => index + 1)).map((page, index) => (index + 1) + ' → ' + page).join(', '),
    ['FORMAT DE SORTIE', 'Réponds UNIQUEMENT par un objet JSON, sans texte avant ni après, sans Markdown. Respecte le schéma JSON contraint transmis avec la requête. Les notes sont des nombres et restent dans les limites du barème ; n’invente aucune note.', 'Réponds avec un JSON complet et concis. Un seul bilan par critère, pas de descriptions identiques pour les différents dessins.'].join('\n'),
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
    'FORMAT DE SORTIE : réponds UNIQUEMENT par le JSON complet conforme au schéma, sans Markdown. Reste concis.',
  ].join('\n\n');
}

/** A genuinely smaller second request after token-budget exhaustion.
 * Keep the rubric and subject, but remove explanatory instructions and verbose examples.
 */
export function buildConciseScientificDiagramPrompt(request: ScientificDiagramAnalysisRequest): string {
  const criteria = request.rubric.criteria.map((criterion) => ({
    id: criterion.id,
    title: criterion.title,
    description: criterion.description,
    maxPoints: criterion.maxPoints,
    subcriteria: getRubricSubcriteria(criterion).map((item) => ({ id: item.id, title: item.title, description: item.description, maxPoints: item.maxPoints })),
  }));
  return [
    'RÔLE : évalue uniquement les schémas scientifiques réellement visibles sur cette image à partir du barème fourni.',
    SCIENTIFIC_DIAGRAM_OBSERVATION_RULES,
    'Toute ambiguïté pouvant modifier les points impose requiresTeacherReview=true et une uncertainty concrète ; elle ne démontre pas une faute. Applique uniquement le barème, sans pénalité esthétique ni double pénalisation inventée.',
    'La réponse précédente était tronquée : produis une réponse beaucoup plus courte. summary ≤ 10 mots ; evidence et chaque preuve de sous-critère ≤ 8 mots ; uncertainties ≤ 8 mots par entrée. Pas de reformulation ni de justification longue.',
    'Si aucun schéma identifiable, retourne diagrams: [], criteria: [] et une explication courte dans overallUncertainties. N’invente ni schéma ni point.',
    'Retourne un critère par id, tous ses sous-critères et leurs points justifiés. origin=student-diagram si vu sur la copie, printed-subject si seulement imprimé, uncertain sinon ; uncertainty indique le doute ou vaut chaîne vide. Aucune note pour les preuves imprimées/incertaines. Une phase ne vaut pas titre global. Quatre phases liées = un ensemble de dessins, pas quatre barèmes. PageNumber = 1. La qualité graphique scientifique observable se note si exigée, jamais la beauté subjective.',
    'BARÈME : ' + JSON.stringify(criteria),
    'QUESTION : ' + request.question,
    ...(request.subjectTranscription ? ['SUJET : ' + request.subjectTranscription] : []),
    'FORMAT DE SORTIE : réponds UNIQUEMENT par un objet JSON conforme au schéma transmis, sans Markdown, sans texte autour.',
  ].join('\n\n');
}

