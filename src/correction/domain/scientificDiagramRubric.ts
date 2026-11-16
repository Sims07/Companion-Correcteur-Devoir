import { validateRubric, type Rubric } from './rubric.ts';
import { SCIENTIFIC_DIAGRAM_MAIN_TITLE_RULE } from './scientificDiagramObservation.ts';

/** Faithful copy of the professor's observable dimensions. The 2-point
 * "Compréhension" criterion is excluded until diagram-specific expectations
 * have been supplied; we must never invent a biological answer key. */
export const SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC: Rubric = {
  title: 'Dessin scientifique — critères observables (8 points)',
  criteria: [
    {
      id: 'drawing', title: 'Qualité du dessin', description: '', maxPoints: 4,
      analysisMode: 'scientific-diagram',
      subcriteria: [
        { id: 'drawing-page', title: 'Occupe toute la page', description: '', maxPoints: 0.66 },
        { id: 'drawing-centered', title: 'Centré', description: '', maxPoints: 0.66 },
        { id: 'drawing-lines', title: 'Traits fins, continus, précis de même épaisseur', description: '', maxPoints: 0.66 },
        { id: 'drawing-clean', title: 'Impression générale Propre', description: '', maxPoints: 0.66 },
        { id: 'drawing-proportions', title: 'Fidèle à la réalité (Proportions respectées)', description: '', maxPoints: 0.66 },
        { id: 'drawing-neighbors', title: 'Départ des cellules voisines indiqué', description: '', maxPoints: 0.7 },
      ],
    },
    {
      id: 'title', title: 'Titre', description: SCIENTIFIC_DIAGRAM_MAIN_TITLE_RULE, maxPoints: 2,
      analysisMode: 'scientific-diagram',
      subcriteria: [
        { id: 'title-below', title: "Placé en dessous", description: "Le titre PRINCIPAL est évalué par rapport à la production complète, quel que soit le nombre de sous-schémas. Avec quatre panneaux de mitose, il doit être sous l’ensemble des quatre dessins, pas simplement sous une cellule. « Prophase », « Métaphase », « Anaphase », « Télophase » et « Interphase » sous les cellules sont des intitulés locaux, jamais le titre principal. Si le titre commun est au-dessus, attribuer zéro uniquement à « placé en dessous » : évaluer indépendamment les autres propriétés du titre.", maxPoints: 0.33 },
        { id: 'title-centered', title: "centré", description: "Évaluer le centrage du titre principal descriptif par rapport à toute la composition (pas au seul panneau dessous) ; sa position au-dessus n’invalide pas automatiquement le centrage. Ne pas utiliser le centrage des noms de phases.", maxPoints: 0.33 },
        { id: 'title-emphasis', title: "Souligné ou encadré ou en majuscule", description: "Observer uniquement le titre principal commun aux schémas, qu’il soit au-dessus ou en dessous ; un nom de phase souligné, encadré ou en majuscules ne remplace pas cette propriété du titre principal.", maxPoints: 0.33 },
        { id: 'title-horizontal', title: "Ecriture horizontale", description: "Vérifier l’horizontalité du texte du titre principal commun, et non celle des noms de phases ou des légendes de structures. Évaluer cette propriété même si le titre est mal placé.", maxPoints: 0.33 },
        { id: 'title-subject', title: "Sujet entièrement précisé ( type de cellule, organe, organisme)", description: "Contrôler que le titre principal décrit l’objet de l’ensemble et précise le type de cellule, l’organe et l’organisme attendus ; un nom de phase seul, la consigne imprimée ou une étiquette locale ne suffisent pas. Ne pas inférer des informations non écrites.", maxPoints: 0.33 },
        { id: 'title-section', title: "Indique s'il y a une coupe réalisée", description: "Rechercher dans le titre principal commun la mention de coupe quand elle est attendue par le barème ; ne pas l’inférer depuis un dessin ou un intitulé de phase et ne pas reprendre le texte de la consigne. Si l’exigence de coupe est ambiguë dans le contexte du devoir, demander confirmation.", maxPoints: 0.35 },
      ],
    },
    {
      id: 'legends', title: 'légendes', description: 'Distinguer les noms de structures reliés par des traits de rappel des intitulés de phases. Vérifier la disposition des légendes dans chaque panneau et la cible réelle de chaque trait ; ne pas exiger de flèche sur un dessin au microscope.', maxPoints: 2,
      analysisMode: 'scientific-diagram',
      subcriteria: [
        { id: 'legends-horizontal', title: "Ecriture horizontale", description: "Évaluer l’orientation de l’ÉCRITURE des noms des structures dans chaque panneau, pas la direction de leurs traits de rappel, ni l’alignement des textes entre eux. Exclure les intitulés de phases et textes du sujet imprimé.", maxPoints: 0.66 },
        { id: 'legends-aligned', title: "Alignées en colonne", description: "Évaluer les textes des légendes AU SEIN de chaque sous-schéma : ils sont placés les uns sous les autres, alignés verticalement dans une colonne. La disposition des sous-schémas en grille ne mesure pas l’alignement de leurs légendes. Des légendes côte à côte sur une même ligne dans un panneau ne forment pas une colonne ; l’écriture horizontale des mots est évaluée séparément. Ne combiner ni pénaliser les légendes de panneaux différents. Ne pas compter les noms de phases comme légendes. Quand une seule légende est identifiable, ne pas supposer un alignement de plusieurs textes.", maxPoints: 0.66 },
        { id: 'legends-visible', title: "Légendes reliées aux structures réellement visibles", description: "Pour chaque légende du dessin observé au microscope, suivre son trait de rappel depuis le texte jusqu’à la structure touchée et vérifier que le nom correspond à cette structure précise. Un simple trait sans pointe de flèche suffit : ne pas exiger de sens directionnel. Une légende correcte mais reliée à une mauvaise structure ne valide pas cet attendu, même si la bonne structure existe ailleurs. Ne pas confondre un croisement de traits avec leur arrivée. Un intitulé de phase sans trait ne constitue pas une légende de structure. Si le trait ou sa cible est illisible, demander une vérification.", maxPoints: 0.68 },
      ],
    },
  ],
};

/** Imports the application's JSON rubric format, with no model-generated changes.
 * All dimensions must be explicit and independently measurable for this rubric.
 * Legacy "Compréhension" prose without measurable subcriteria is omitted. */
export function parseScientificDiagramRubric(value: unknown): Rubric {
  const document = asObject(value, 'Le JSON doit contenir un objet barème.');
  const source = document.rubric === undefined ? document : asObject(document.rubric, 'Barème invalide.');
  if (!Array.isArray(source.criteria)) throw new Error('Le barème doit contenir une liste de critères.');
  const criteria = source.criteria.map((entry) => {
    const criterion = asObject(entry, 'Critère invalide.');
    if (criterion.subcriteria !== undefined && !Array.isArray(criterion.subcriteria)) throw new Error('Les sous-critères doivent former une liste.');
    const subcriteria = (criterion.subcriteria ?? []).map((child: unknown) => {
      const sub = asObject(child, 'Sous-critère invalide.');
      return {
        id: checkedString(sub.id, 'Identifiant de sous-critère'),
        title: checkedString(sub.title, 'Titre de sous-critère'),
        description: typeof sub.description === 'string' ? sub.description : '',
        maxPoints: checkedPoints(sub.maxPoints),
      };
    });
    return {
      id: checkedString(criterion.id, 'Identifiant de critère'),
      title: checkedString(criterion.title, 'Titre de critère'),
      description: typeof criterion.description === 'string' ? criterion.description : '',
      maxPoints: checkedPoints(criterion.maxPoints),
      analysisMode: 'scientific-diagram' as const,
      subcriteria,
    };
  }).filter((criterion) => criterion.subcriteria.length > 0 ||
    !/compr[eé]hension/i.test(criterion.title));
  if (criteria.some((criterion) => criterion.subcriteria.length === 0)) {
    throw new Error('Définissez des sous-critères mesurables pour chaque critère du schéma.');
  }
  const rubric: Rubric = {
    title: typeof source.title === 'string' ? source.title :
      typeof source.rubricTitle === 'string' ? source.rubricTitle : 'Barème de dessin scientifique',
    criteria,
  };
  const validation = validateRubric(rubric);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  return rubric;
}

function asObject(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}
function checkedString(value: unknown, title: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(title + ' manquant.');
  return value;
}
function checkedPoints(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('Les points doivent être des nombres positifs ou nuls.');
  return value;
}
