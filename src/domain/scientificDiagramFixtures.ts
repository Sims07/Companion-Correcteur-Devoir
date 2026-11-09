import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, diagramTargetKey, type DiagramGold, type DiagramProtocolCount, type DiagramProtocolRun, buildScientificDiagramProtocolReport } from './scientificDiagramProtocol.ts';
import { getRubricSubcriteria, validateRubric, type Rubric } from './rubric.ts';
import { sumGradeScores } from './scorePrecision.ts';

/** The same teacher rubric, with the original 2-point comprehension criterion
 * made explicit for this particular mitosis exercise only. */
export const SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC: Rubric = {
  title: 'Mitose végétale — schéma scientifique (10 points)',
  criteria: [
    // The embedded exercise tests both visibility and the actual geometric
    // connection between a written legend and its arrow endpoint. It does
    // not modify the user's general teacher rubric.
    ...structuredClone(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria).map((criterion) => (
      criterion.id === 'legends' ? {
        ...criterion,
        subcriteria: criterion.subcriteria?.map((sub) => sub.id === 'legends-visible'
          ? { ...sub, title: 'Légendes : structures visibles et flèches correctes',
            description: 'Une légende doit nommer une structure dessinée ET son trait de rappel doit réellement pointer cette structure. Des mots exacts reliés à une autre structure ne valident pas cet attendu.' }
          : sub),
      } : criterion
    )),
    {
      id: 'understanding', title: 'Compréhension', maxPoints: 2,
      description: 'Interphase obligatoire, télophase avec phragmoplaste visible, et deux autres étapes distinctes parmi prophase, métaphase, anaphase.',
      analysisMode: 'scientific-diagram',
      subcriteria: [
        { id: 'understanding-interphase', title: 'Interphase représentée', description: 'Au moins une cellule végétale en interphase identifiable, avec noyau non divisé.', maxPoints: 0.5 },
        { id: 'understanding-telophase', title: 'Télophase avec phragmoplaste visible', description: 'Deux noyaux reformés et une structure de cloisonnement identifiable (phragmoplaste / plaque cellulaire naissante). Une simple étiquette sans dessin ne suffit pas.', maxPoints: 0.5 },
        { id: 'understanding-other-one', title: 'Première phase supplémentaire de mitose', description: 'Au moins une phase identifiable parmi prophase, métaphase et anaphase, distincte de l’interphase et de la télophase.', maxPoints: 0.5 },
        { id: 'understanding-other-two', title: 'Deuxième phase supplémentaire distincte', description: 'Au moins deux phases différentes et identifiables parmi prophase, métaphase et anaphase. Ne pas compter deux fois la même phase.', maxPoints: 0.5 },
      ],
    },
  ],
};

export type ScientificDiagramFixtureId = 'A' | 'B' | 'C' | 'D' | 'E';
export const SCIENTIFIC_DIAGRAM_BASE_CASE_IDS = ['A', 'B', 'C'] as const;
export const SCIENTIFIC_DIAGRAM_POINTER_CASE_IDS = ['D', 'E'] as const;
export const SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET = diagramTargetKey('legends', 'legends-visible');
export interface ScientificDiagramFixtureCase {
  id: ScientificDiagramFixtureId;
  label: string;
  description: string;
  referenceScore: number;
  referencePoints: Record<string, number>;
  gold: DiagramGold;
  labelPointerChallenge?: {
    kind: 'label-pointer-correspondence';
    expected: 'correct' | 'incorrect';
    criterionKey: string;
    descriptions: readonly string[];
  };
  layoutObservation?: {
    criterionKey: string;
    points: number;
    maximumPoints: number;
    reason: string;
  };
  referenceReview?: { status: 'provisional-visual-review'; reviewedOn: string; notes: Record<string, string> };
}

/** Visual review of the actual bundled B image (2026-11-08), independent of
 * model predictions. Fractional aesthetic judgments remain provisional. */
const middlePointsBySubcriterion: Record<string, number> = {
  'drawing-page': 0.33,
  'drawing-centered': 0.66,
  'drawing-lines': 0.33,
  'drawing-clean': 0.50,
  'drawing-proportions': 0.50,
  'drawing-neighbors': 0.70,
  'title-below': 0,
  'title-centered': 0.17,
  'title-emphasis': 0,
  'title-horizontal': 0.33,
  'title-subject': 0.17,
  'title-section': 0,
  'legends-horizontal': 0.66,
  'legends-aligned': 0.33,
  'legends-visible': 0.68,
  'understanding-interphase': 0.50,
  'understanding-telophase': 0.50,
  'understanding-other-one': 0.50,
  'understanding-other-two': 0.50,
};

const middleReviewNotes: Record<string, string> = {
  'drawing-page': 'Quatre cellules et leurs légendes occupent une part importante de la feuille, avec de larges marges : appréciation partielle.',
  'drawing-centered': 'Les quatre cellules forment une composition globalement centrée ; les légendes sont réparties autour.',
  'drawing-lines': 'Contours lisibles mais repassés, épaisseur variable et tracés intérieurs irréguliers.',
  'drawing-clean': 'Ensemble lisible et sans grandes ratures ; hachures et reprises de crayon. La couleur seule ne justifie aucune pénalité.',
  'drawing-proportions': 'Cellules de tailles cohérentes ; fidélité fine des proportions non vérifiable sans référence anatomique. Attribution provisoire.',
  'drawing-neighbors': 'Des prolongements de paroi sont visibles aux coins des cellules : départs des cellules voisines indiqués.',
  'title-below': 'Le titre général est au-dessus des dessins, pas en dessous.',
  'title-centered': 'Le titre général est légèrement décalé à gauche du centre de la composition : appréciation partielle.',
  'title-emphasis': 'Titre ni souligné ni encadré ni écrit entièrement en majuscules.',
  'title-horizontal': 'Le titre est écrit horizontalement.',
  'title-subject': 'Mitose et cellule végétale sont indiquées ; organe et organisme ne sont pas précisés.',
  'title-section': 'Aucune indication de coupe. Zéro selon le critère actuel ; applicabilité à confirmer par le professeur.',
  'legends-horizontal': 'Les mots des légendes sont globalement horizontaux, indépendamment de la pente des traits de rappel.',
  'legends-aligned': 'Alignement local des légendes de droite, mais pas de colonne régulière sur l’ensemble : appréciation partielle.',
  'legends-visible': 'Noyaux, chromosomes, traits du fuseau et plaque cellulaire sont dessinés. Vérifier les destinations précises si le professeur exige une précision anatomique supérieure.',
  'understanding-interphase': 'Cellule avec noyau unique identifiable en haut à gauche.',
  'understanding-telophase': 'Deux noyaux et une cloison centrale dessinés. Le contrat actuel accepte une plaque cellulaire ; cela ne prouve pas un phragmoplaste détaillé.',
  'understanding-other-one': 'Prophase reconnaissable en haut à droite par les chromosomes condensés.',
  'understanding-other-two': 'Métaphase distincte en bas à gauche avec chromosomes alignés et fuseau dessiné.',
};

function makeCase(id: ScientificDiagramFixtureId, label: string, description: string, calibration: 0 | 10 | Record<string, number>): ScientificDiagramFixtureCase {
  const gold: DiagramGold = {};
  const referencePoints: Record<string, number> = {};
  for (const criterion of SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria) {
    for (const sub of getRubricSubcriteria(criterion)) {
      const key = diagramTargetKey(criterion.id, sub.id);
      const awarded = calibration === 10 ? sub.maxPoints : calibration === 0 ? 0 : calibration[sub.id];
      if (awarded === undefined || !Number.isFinite(awarded) || awarded < 0 || awarded > sub.maxPoints) {
        throw new Error('Référence pilote incomplète ou hors barème pour ' + key);
      }
      referencePoints[key] = awarded;
      gold[key] = awarded === 0 ? 'absent' : awarded === sub.maxPoints ? 'present' : 'partial';
    }
  }
  const referenceScore = sumGradeScores(Object.values(referencePoints));
  if (typeof calibration === 'number' && referenceScore !== calibration) throw new Error('Référence pilote : total incohérent.');
  return { id, label, description, referenceScore, referencePoints, gold };
}

/** Both D and E use horizontal rows of legends, not the single column
 * required by the teacher rubric. Calibrate that defect identically in the
 * control and the trap; only the arrow-endpoint criterion should differ. */
const POINTER_LAYOUT_TARGET = diagramTargetKey('legends', 'legends-aligned');
const pointerControlPoints = Object.fromEntries(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.flatMap((criterion) =>
  getRubricSubcriteria(criterion).map((sub) => [
    sub.id, diagramTargetKey(criterion.id, sub.id) === POINTER_LAYOUT_TARGET ? 0 : sub.maxPoints,
  ])));
const wrongPointerPoints = { ...pointerControlPoints, 'legends-visible': 0 };
const POINTER_LAYOUT_OBSERVATION = {
  criterionKey: POINTER_LAYOUT_TARGET,
  points: 0,
  maximumPoints: 0.66,
  reason: 'Les légendes sont disposées en lignes sous les cellules, et non alignées en colonne comme l’exige le barème.',
} as const;
const POINTER_LABELS = [
  'En métaphase : « Chromosomes » pointe le fuseau et « Fuseau mitotique » pointe les chromosomes.',
  'En télophase : « Noyau fils » pointe la plaque cellulaire et « Plaque cellulaire » pointe le noyau fils.',
] as const;

/** Generated scenarios, not a teacher-certified dataset. */
export const SCIENTIFIC_DIAGRAM_FIXTURES: readonly ScientificDiagramFixtureCase[] = [
  makeCase('A', 'A — soigné', 'Schéma de mitose végétale clair, titré et légendé, avec les quatre étapes.', 10),
  { ...makeCase('B', 'B — intermédiaire', 'Quatre étapes reconnaissables, composition lisible ; traits irréguliers, titre incomplet et légendes imparfaitement alignées.', middlePointsBySubcriterion),
    referenceReview: { status: 'provisional-visual-review', reviewedOn: '2026-11-08', notes: middleReviewNotes } },
  makeCase('C', 'C — insuffisant', 'Une seule cellule confuse, sans déroulé de la mitose, titre et organisation inadaptés.', 0),
  { ...makeCase('D', 'D — témoin, flèches justes', 'Mêmes quatre phases, mêmes mots et même barème que E ; flèches correctes, mais légendes non alignées en colonne.', pointerControlPoints),
    layoutObservation: POINTER_LAYOUT_OBSERVATION,
    labelPointerChallenge: {
      kind: 'label-pointer-correspondence', expected: 'correct',
      criterionKey: SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET,
      descriptions: ['Les flèches correspondent aux noms écrits, y compris fuseau, chromosomes, noyau fils et plaque cellulaire.'],
    } },
  { ...makeCase('E', 'E — piège, flèches inversées', 'Même dessin et mêmes mots que D ; quatre flèches erronées et légendes non alignées en colonne.', wrongPointerPoints),
    layoutObservation: POINTER_LAYOUT_OBSERVATION,
    labelPointerChallenge: {
      kind: 'label-pointer-correspondence', expected: 'incorrect',
      criterionKey: SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET, descriptions: POINTER_LABELS,
    } },
];

export const SCIENTIFIC_DIAGRAM_FIXTURE_CONTEXT =
  'Travail universitaire de biologie : réaliser un dessin scientifique montrant la mitose d’une cellule végétale, avec interphase, télophase et phragmoplaste visible, puis deux autres étapes distinctes choisies parmi prophase, métaphase, anaphase. Vérifier la qualité graphique, le titre, les légendes (y compris le point d’arrivée de chaque trait de rappel) et la présence des étapes réellement dessinées.';

export type ScientificDiagramFixtureRun = DiagramProtocolRun & { caseId: ScientificDiagramFixtureId };

export function buildScientificDiagramFixtureReport(
  runs: readonly ScientificDiagramFixtureRun[], plannedRepetitions: DiagramProtocolCount, createdAt: string,
) {
  if (!validateRubric(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC).valid) throw new Error('Le barème pilote est invalide.');
  const cases = SCIENTIFIC_DIAGRAM_FIXTURES.map((fixture) => {
    const caseRuns = runs.filter((run) => run.caseId === fixture.id);
    const benchmark = buildScientificDiagramProtocolReport(
      caseRuns, SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC, fixture.gold,
      plannedRepetitions, createdAt, 1,
    );
    return {
      caseId: fixture.id,
      label: fixture.label,
      referenceScore: fixture.referenceScore,
      expectedPoints: structuredClone(fixture.referencePoints),
      gold: structuredClone(fixture.gold),
      ...(fixture.labelPointerChallenge ? { labelPointerChallenge: structuredClone(fixture.labelPointerChallenge) } : {}),
      ...(fixture.layoutObservation ? { layoutObservation: structuredClone(fixture.layoutObservation) } : {}),
      ...(fixture.referenceReview ? { referenceReview: structuredClone(fixture.referenceReview) } : {}),
      summaries: benchmark.summaries,
      experiments: benchmark.experiments,
    };
  });
  return {
    format: 'companion-scientific-diagram-fixture-report',
    version: 4,
    protocolId: 'scientific-diagram-generated-a-b-c-plus-label-pointers-v4',
    createdAt,
    plannedRepetitions,
    rubric: structuredClone(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC),
    context: SCIENTIFIC_DIAGRAM_FIXTURE_CONTEXT,
    localOnly: runs.every(({ record }) => record.configurations.every((config) => {
      try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.endpoint).hostname); } catch { return false; }
    })),
    limitations: 'Cinq dessins synthétiques (A/B/C et paire contrôlée D/E), références PROVISOIRES non validées par un enseignant. A=10/10, B=7,36/10, C=0/10, D=9,34/10, E=8,66/10. D et E perdent chacun 0,66 point au critère « Légendes alignées en colonne », car leurs légendes sont en lignes. Les deux images ne diffèrent que par quatre destinations de flèches : seul le critère « Légendes : structures visibles et flèches correctes » (0,68 point) change entre D et E. Ces pénalités suivent le barème du pilote, mais les autres critères et les notes totales restent des références provisoires à confirmer par un enseignant. Les exports antérieurs de version 3 ne sont pas recalibrés automatiquement. Les images, clés, endpoints et réponses brutes ne sont jamais exportés.',
    cases,
  };
}
