import { validateRubric, type Rubric } from './rubric.ts';

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
      id: 'title', title: 'Titre', description: '', maxPoints: 2,
      analysisMode: 'scientific-diagram',
      subcriteria: [
        { id: 'title-below', title: 'Placé en dessous', description: '', maxPoints: 0.33 },
        { id: 'title-centered', title: 'centré', description: '', maxPoints: 0.33 },
        { id: 'title-emphasis', title: 'Souligné ou encadré ou en majuscule', description: '', maxPoints: 0.33 },
        { id: 'title-horizontal', title: 'Ecriture horizontale', description: '', maxPoints: 0.33 },
        { id: 'title-subject', title: 'Sujet entièrement précisé ( type de cellule, organe, organisme)', description: '', maxPoints: 0.33 },
        { id: 'title-section', title: 'Indique s\'il y a une coupe réalisée', description: '', maxPoints: 0.35 },
      ],
    },
    {
      id: 'legends', title: 'légendes', description: '', maxPoints: 2,
      analysisMode: 'scientific-diagram',
      subcriteria: [
        { id: 'legends-horizontal', title: 'Ecriture horizontale', description: '', maxPoints: 0.66 },
        { id: 'legends-aligned', title: 'Alignées en colonne', description: 'Pour un même schéma, les textes des légendes sont placés les uns sous les autres et alignés verticalement dans une même colonne. Des légendes côte à côte sur une même ligne ne satisfont pas ce critère. L’écriture horizontale des mots est évaluée séparément.', maxPoints: 0.66 },
        { id: 'legends-visible', title: 'Légendes reliées aux structures réellement visibles', description: 'Pour chaque légende du dessin observé au microscope, suivre son trait de rappel depuis le texte jusqu’à la structure touchée et vérifier que le nom correspond à cette structure. Un simple trait sans pointe de flèche suffit. Une légende correcte mais reliée à une mauvaise structure ne valide pas cet attendu ; si le trait est illisible, demander une vérification.', maxPoints: 0.68 },
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
