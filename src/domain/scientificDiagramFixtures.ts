import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, diagramTargetKey, type DiagramGold, type DiagramProtocolCount, type DiagramProtocolRun, buildScientificDiagramProtocolReport } from './scientificDiagramProtocol.ts';
import { getRubricSubcriteria, validateRubric, type Rubric } from './rubric.ts';
import { sumGradeScores } from './scorePrecision.ts';

/** The same teacher rubric, with the original 2-point comprehension criterion
 * made explicit for this particular mitosis exercise only. */
export const SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC: Rubric = {
  title: 'Mitose végétale — schéma scientifique (10 points)',
  criteria: [
    ...structuredClone(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria),
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

export type ScientificDiagramFixtureId = 'A' | 'B' | 'C';
export interface ScientificDiagramFixtureCase {
  id: ScientificDiagramFixtureId;
  label: string;
  description: string;
  referenceScore: number;
  referencePoints: Record<string, number>;
  gold: DiagramGold;
}

/** Provisional teacher-style calibration of the generated *middle-quality*
 * drawing. All 19 decisions and 0.01-point allocations are explicitly authored,
 * not inferred from its target 5/10. Educators should review the ground truth
 * before using accuracy figures as evidence about real student work. */
const middlePointsBySubcriterion: Record<string, number> = {
  'drawing-page': 0,
  'drawing-centered': 0.33,
  'drawing-lines': 0.25,
  'drawing-clean': 0.25,
  'drawing-proportions': 0.33,
  'drawing-neighbors': 0.34,
  'title-below': 0,
  'title-centered': 0,
  'title-emphasis': 0,
  'title-horizontal': 0.33,
  'title-subject': 0.17,
  'title-section': 0,
  'legends-horizontal': 0.50,
  'legends-aligned': 0,
  'legends-visible': 0.50,
  'understanding-interphase': 0.50,
  'understanding-telophase': 0.50,
  'understanding-other-one': 0.50,
  'understanding-other-two': 0.50,
};

function makeCase(id: ScientificDiagramFixtureId, label: string, description: string, target: 0 | 5 | 10): ScientificDiagramFixtureCase {
  const gold: DiagramGold = {};
  const referencePoints: Record<string, number> = {};
  for (const criterion of SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria) {
    for (const sub of getRubricSubcriteria(criterion)) {
      const key = diagramTargetKey(criterion.id, sub.id);
      const awarded = target === 10 ? sub.maxPoints : target === 0 ? 0 : middlePointsBySubcriterion[sub.id];
      if (awarded === undefined || !Number.isFinite(awarded) || awarded < 0 || awarded > sub.maxPoints) {
        throw new Error('Référence pilote incomplète ou hors barème pour ' + key);
      }
      referencePoints[key] = awarded;
      gold[key] = awarded === 0 ? 'absent' : awarded === sub.maxPoints ? 'present' : 'partial';
    }
  }
  const referenceScore = sumGradeScores(Object.values(referencePoints));
  if (referenceScore !== target) throw new Error('Référence pilote : note ' + referenceScore + ' au lieu de ' + target);
  return { id, label, description, referenceScore, referencePoints, gold };
}

/** Generated scenarios, not a teacher-certified dataset. */
export const SCIENTIFIC_DIAGRAM_FIXTURES: readonly ScientificDiagramFixtureCase[] = [
  makeCase('A', 'A — soigné', 'Schéma de mitose végétale clair, titré et légendé, avec les quatre étapes.', 10),
  makeCase('B', 'B — intermédiaire', 'Schéma reconnaissable mais petit, colorié, titre incomplet et légendes irrégulières.', 5),
  makeCase('C', 'C — insuffisant', 'Une seule cellule confuse, sans déroulé de la mitose, titre et organisation inadaptés.', 0),
];

export const SCIENTIFIC_DIAGRAM_FIXTURE_CONTEXT =
  'Travail universitaire de biologie : réaliser un dessin scientifique montrant la mitose d’une cellule végétale, avec interphase, télophase et phragmoplaste visible, puis deux autres étapes distinctes choisies parmi prophase, métaphase, anaphase. Vérifier la qualité graphique, le titre, les légendes et la présence des étapes réellement dessinées.';

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
      summaries: benchmark.summaries,
      experiments: benchmark.experiments,
    };
  });
  return {
    format: 'companion-scientific-diagram-fixture-report',
    version: 1,
    protocolId: 'scientific-diagram-generated-a-b-c-v1',
    createdAt,
    plannedRepetitions,
    rubric: structuredClone(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC),
    context: SCIENTIFIC_DIAGRAM_FIXTURE_CONTEXT,
    localOnly: runs.every(({ record }) => record.configurations.every((config) => {
      try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.endpoint).hostname); } catch { return false; }
    })),
    limitations: 'Trois dessins synthétiques générés, notes et décisions de référence PROVISOIRES (non validées par un enseignant). Notes attendues 10/10, 5/10, 0/10 : elles ne prouvent pas la fidélité au barème sur des dessins réels. Les décisions partielles possèdent une allocation explicite de points ; le modèle peut les déclarer à vérifier. Les images et informations de connexion ne sont jamais exportées.',
    cases,
  };
}
