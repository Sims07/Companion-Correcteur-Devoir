import { buildScientificDiagramProtocolReport, diagramTargetKey, type DiagramGold, type DiagramProtocolCount, type DiagramProtocolRun } from './scientificDiagramProtocol.ts';
import type { Rubric } from './rubric.ts';

export const DIAGRAM_SENSITIVITY_PROTOCOL_ID = 'scientific-diagram-semantic-sensitivity-v1';
export const DIAGRAM_SENSITIVITY_RUBRIC: Rubric = {
  title: 'Relations biologiques observables (3 points expérimentaux)',
  criteria: [{
    id: 'relations', title: 'Relations et structures', maxPoints: 3,
    analysisMode: 'scientific-diagram', description: 'Observer le tracé, pas seulement les mots.',
    subcriteria: [
      { id: 'transcription', title: 'Flèche dirigée de ADN vers ARN',
        description: 'La pointe de la flèche relie ADN à ARN dans ce sens précis ; un trait sans pointe lisible ne suffit pas.', maxPoints: 1 },
      { id: 'translation', title: 'Flèche dirigée de ARN vers Protéine',
        description: 'La pointe aboutit à Protéine et le trait part de ARN. Une autre connexion ne suffit pas.', maxPoints: 1 },
      { id: 'nucleus', title: 'Noyau représenté à l’intérieur de la cellule',
        description: 'Le contour du noyau doit être contenu dans le contour de la cellule. Le seul mot « Noyau » ne suffit pas.', maxPoints: 1 },
    ],
  }],
};

export const DIAGRAM_SENSITIVITY_CONTEXT =
  'Schéma biologique simplifié de la circulation de l’information génétique dans une cellule eucaryote. Les trois critères concernent exclusivement les relations visibles (départ et pointe des flèches) et la position réelle du noyau. Ne déduis pas une flèche de tes connaissances biologiques : seule sa géométrie visible permet de déterminer son sens. Si la pointe est illisible, demande un arbitrage au lieu d’inventer une direction.';

export const DIAGRAM_SENSITIVITY_PROMPT_MODES = ['standard', 'guided'] as const;
export type DiagramSensitivityPromptMode = typeof DIAGRAM_SENSITIVITY_PROMPT_MODES[number];

/** This second arm guides a single grading call. It is NOT a blind separate
 * observation model and never pretends to be one. */
export function diagramSensitivityContext(mode: DiagramSensitivityPromptMode): string {
  if (mode === 'standard') return DIAGRAM_SENSITIVITY_CONTEXT;
  return DIAGRAM_SENSITIVITY_CONTEXT +
    ' CONTRÔLE VISUEL CIBLÉ : pour chaque trait, repère d’abord ses deux extrémités sans leur attribuer de sens, suis le trajet continu, puis localise la POINTE visible et l’élément réellement touché. Détermine le départ et l’arrivée seulement après avoir localisé cette pointe. Un croisement de traits ne suffit pas à établir une connexion. Pour les structures, compare la totalité des contours et vérifie inclusion/exclusion. Réponds au barème seulement après cet examen. Une pointe non discernable doit être signalée comme incertaine ; ne suppose pas le sens scientifique attendu.';
}

export const DIAGRAM_SENSITIVITY_TARGETS = {
  transcription: diagramTargetKey('relations', 'transcription'),
  translation: diagramTargetKey('relations', 'translation'),
  nucleus: diagramTargetKey('relations', 'nucleus'),
} as const;

export const DIAGRAM_SENSITIVITY_CASE_IDS = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'] as const;
export type DiagramSensitivityCaseId = typeof DIAGRAM_SENSITIVITY_CASE_IDS[number];

export interface DiagramSensitivityCase {
  id: DiagramSensitivityCaseId;
  label: string;
  description: string;
  expectedPoints: Readonly<Record<string, number | null>>;
  referenceScore: number | null;
  /** The deliberately ambiguous arrow has no asserted gold label. */
  gold: DiagramGold;
  mutation: 'control' | 'reverse-arrow' | 'wrong-target' | 'outside-cell' | 'layout-change' | 'unreadable-tip';
  changedTarget: string | null;
}

const T = DIAGRAM_SENSITIVITY_TARGETS;
function makeCase(
  id: DiagramSensitivityCaseId, label: string, description: string,
  mutation: DiagramSensitivityCase['mutation'], target: keyof typeof T | null,
): DiagramSensitivityCase {
  const points: Record<string, number | null> = {
    [T.transcription]: id === 'S1' || id === 'S2' ? 0 : id === 'S5' ? null : 1,
    [T.translation]: 1,
    [T.nucleus]: id === 'S3' ? 0 : 1,
  };
  const gold: DiagramGold = {};
  for (const [key, pointsAwarded] of Object.entries(points)) {
    if (pointsAwarded !== null) gold[key] = pointsAwarded === 1 ? 'present' : 'absent';
  }
  return {
    id, label, description, mutation, changedTarget: target ? T[target] : null,
    expectedPoints: points, referenceScore: Object.values(points).some((item) => item === null)
      ? null : Object.values(points).reduce<number>((total, item) => total + (item ?? 0), 0),
    gold,
  };
}

/** Synthetic reference judgments, not calibrated with real student work. */
export const DIAGRAM_SENSITIVITY_CASES: readonly DiagramSensitivityCase[] = [
  makeCase('S0', 'Témoin correct', 'Deux flèches orientées et noyau dans la cellule.', 'control', null),
  makeCase('S1', 'Flèche inversée', 'Seule la flèche ADN / ARN change de sens.', 'reverse-arrow', 'transcription'),
  makeCase('S2', 'Mauvaise connexion', 'ADN pointe vers Protéine au lieu de ARN.', 'wrong-target', 'transcription'),
  makeCase('S3', 'Structure déplacée', 'Noyau et ADN sont dessinés hors de la cellule.', 'outside-cell', 'nucleus'),
  makeCase('S4', 'Disposition différente', 'Relations correctes, mais disposition verticale.', 'layout-change', null),
  makeCase('S5', 'Pointe non lisible', 'Le premier lien ne permet pas une direction certaine.', 'unreadable-tip', 'transcription'),
];

/** Generated locally: the same labels appear in every variant. No expected
 * judgments, scores, model prompts or reference answers are drawn into the SVG. */
export function scientificDiagramSensitivitySvg(id: DiagramSensitivityCaseId): string {
  const variant = DIAGRAM_SENSITIVITY_CASES.find((item) => item.id === id);
  if (!variant) throw new Error('Variante de schéma inconnue.');
  const vertical = id === 'S4';
  const outside = id === 'S3';
  const dna = { x: outside ? 122 : vertical ? 425 : 385, y: vertical ? 220 : 310 };
  const rna = { x: vertical ? 735 : 645, y: vertical ? 220 : 310 };
  const protein = { x: vertical ? 735 : 905, y: vertical ? 442 : 310 };
  const rectangle = (x: number, y: number, width: number, label: string) =>
    '<rect x="' + (x - width / 2) + '" y="' + (y - 36) + '" width="' + width +
    '" height="72" rx="14" fill="white" stroke="#202632" stroke-width="4"/>' +
    '<text x="' + x + '" y="' + (y + 9) + '" text-anchor="middle" font-size="29" font-weight="600" fill="#202632">' + label + '</text>';
  const line = (points: string, tipped = true) =>
    '<path d="' + points + '" fill="none" stroke="#202632" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"' +
    (tipped ? ' marker-end="url(#arrow)"' : '') + '/>';
  const first = id === 'S1'
    ? line('M' + (rna.x - 71) + ' ' + rna.y + ' L' + (dna.x + 72) + ' ' + dna.y)
    : id === 'S2'
      ? line('M' + (dna.x + 35) + ' ' + (dna.y - 37) + ' L' + (dna.x + 90) +
        ' 148 L' + protein.x + ' 148 L' + protein.x + ' ' + (protein.y - 45))
      : line('M' + (dna.x + 72) + ' ' + dna.y + ' L' + (rna.x - 74) + ' ' + rna.y, id !== 'S5');
  const second = vertical
    ? line('M' + rna.x + ' ' + (rna.y + 42) + ' L' + protein.x + ' ' + (protein.y - 45))
    : line('M' + (rna.x + 73) + ' ' + rna.y + ' L' + (protein.x - 96) + ' ' + protein.y);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="610" viewBox="0 0 1100 610">',
    '<defs><marker id="arrow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L12 6 L0 12 z" fill="#202632"/></marker></defs>',
    '<rect width="1100" height="610" fill="white"/>',
    '<rect x="250" y="78" width="790" height="465" rx="48" fill="none" stroke="#202632" stroke-width="6"/>',
    '<text x="292" y="120" font-size="28" fill="#202632">Cellule</text>',
    '<ellipse cx="' + dna.x + '" cy="' + dna.y + '" rx="115" ry="' + (vertical ? 110 : 122) +
      '" fill="none" stroke="#202632" stroke-width="5"/>',
    '<text x="' + dna.x + '" y="' + (dna.y + (vertical ? 152 : 160)) +
      '" text-anchor="middle" font-size="28" fill="#202632">Noyau</text>',
    first, second,
    rectangle(dna.x, dna.y, 128, 'ADN'),
    rectangle(rna.x, rna.y, 130, 'ARN'),
    rectangle(protein.x, protein.y, 180, 'Protéine'),
    '</svg>',
  ].join('');
}

export function scientificDiagramSensitivityPreviewUrl(id: DiagramSensitivityCaseId): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(scientificDiagramSensitivitySvg(id));
}

export type DiagramSensitivityRun = DiagramProtocolRun & {
  caseId: DiagramSensitivityCaseId;
  promptMode?: DiagramSensitivityPromptMode;
};
export type DiagramSensitivityChoice = 'present' | 'absent' | 'partial' | 'uncertain';
export interface DiagramSensitivityReading {
  caseId: DiagramSensitivityCaseId;
  profileId: string;
  method: string;
  promptMode?: DiagramSensitivityPromptMode;
  repetition: number;
  observations: Record<string, DiagramSensitivityChoice>;
}

/** A mutation is caught only if the paired control is observed as present and
 * the mutated target is observed as absent. Missing/uncertain is not a miss. */
export function summarizeDiagramSensitivity(readings: readonly DiagramSensitivityReading[]) {
  const identities = [...new Set(readings.map((item) => item.profileId + '\u0000' + item.method +
    '\u0000' + (item.promptMode ?? 'standard')))];
  return identities.map((identity) => {
    const [profileId, method, promptMode] = identity.split('\u0000');
    const subset = readings.filter((item) =>
      item.profileId === profileId && item.method === method && (item.promptMode ?? 'standard') === promptMode);
    const lookup = new Map(subset.map((item) => [item.caseId + '#' + item.repetition, item]));
    const controls = subset.filter((item) => item.caseId === 'S0' || item.caseId === 'S4');
    const targets = Object.values(T);
    const correctControls = controls.flatMap((item) => targets.map((key) => item.observations[key]))
      .filter((choice) => choice === 'present').length;
    const falsePositiveCount = controls.flatMap((item) => targets.map((key) => item.observations[key]))
      .filter((choice) => choice === 'absent' || choice === 'partial').length;
    const readingsCount = subset.length * targets.length;
    const abstentions = subset.flatMap((item) => targets.map((key) => item.observations[key]))
      .filter((choice) => choice === undefined || choice === 'uncertain').length;
    let sensitivityHits = 0;
    let sensitivityTrials = 0;
    let sensitivityUnknown = 0;
    for (const mutant of subset.filter((item) => ['S1', 'S2', 'S3'].includes(item.caseId))) {
      const target = DIAGRAM_SENSITIVITY_CASES.find((item) => item.id === mutant.caseId)?.changedTarget;
      const control = lookup.get('S0#' + mutant.repetition);
      const observed = target && mutant.observations[target];
      const baseline = target && control?.observations[target];
      if (!target || !control || !observed || baseline !== 'present' || observed === 'uncertain') {
        sensitivityUnknown += 1;
      } else {
        sensitivityTrials += 1;
        if (baseline === 'present' && observed === 'absent') sensitivityHits += 1;
      }
    }
    const layoutChecks = subset.filter((item) => item.caseId === 'S4').flatMap((item) =>
      targets.map((target) => ({
        base: lookup.get('S0#' + item.repetition)?.observations[target],
        reordered: item.observations[target],
      })));
    return {
      profileId: profileId ?? '', method: method ?? '',
      promptMode: (promptMode ?? 'standard') as DiagramSensitivityPromptMode,
      runs: subset.length, sensitivityHits, sensitivityTrials, sensitivityUnknown,
      falsePositiveCount, correctControls, controlObservations: controls.length * targets.length,
      abstentions, readingsCount,
      layoutPreserved: layoutChecks.filter((item) => item.base === 'present' && item.reordered === 'present').length,
      layoutChecks: layoutChecks.length,
    };
  });
}

export function buildScientificDiagramSensitivityReport(
  runs: readonly DiagramSensitivityRun[], plannedRepetitions: DiagramProtocolCount, createdAt: string,
  promptModes: readonly DiagramSensitivityPromptMode[] = ['standard'],
) {
  const cases = promptModes.flatMap((promptMode) => DIAGRAM_SENSITIVITY_CASES.map((testCase) => {
    const benchmark = buildScientificDiagramProtocolReport(
      runs.filter((run) => run.caseId === testCase.id && (run.promptMode ?? 'standard') === promptMode), DIAGRAM_SENSITIVITY_RUBRIC,
      testCase.gold, plannedRepetitions, createdAt, 1,
    );
    return {
      caseId: testCase.id, promptMode, label: testCase.label, mutation: testCase.mutation,
      changedTarget: testCase.changedTarget, referenceScore: testCase.referenceScore,
      expectedPoints: { ...testCase.expectedPoints }, gold: { ...testCase.gold },
      summaries: benchmark.summaries, experiments: benchmark.experiments,
    };
  }));
  const readings: DiagramSensitivityReading[] = cases.flatMap((testCase) =>
    testCase.experiments.map((experiment) => ({
      caseId: testCase.caseId, profileId: experiment.profileId, method: experiment.method,
      promptMode: testCase.promptMode,
      repetition: experiment.repetition,
      observations: Object.fromEntries(experiment.observations.map((observation) =>
        [observation.key, observation.choice])) as Record<string, DiagramSensitivityChoice>,
    })));
  return {
    format: 'companion-scientific-diagram-sensitivity-report',
    version: 2, protocolId: DIAGRAM_SENSITIVITY_PROTOCOL_ID, promptModes: [...promptModes],
    createdAt, plannedRepetitions, rubric: structuredClone(DIAGRAM_SENSITIVITY_RUBRIC),
    localOnly: cases.every((testCase) => testCase.experiments.length === 0 ||
      runs.filter((run) => run.caseId === testCase.caseId).every(({ record }) =>
        record.configurations.every((config) => {
          try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.endpoint).hostname); }
          catch { return false; }
        }))),
    statistics: summarizeDiagramSensitivity(readings),
    cases,
    limitations: 'Deux consignes expérimentales : standard et examen ciblé des connexions dans un seul appel (pas de lecture à l’aveugle, pas d’extraction indépendante). Six images synthétiques, références provisoires à faire valider par un professeur. Sensibilité calculée uniquement sur les paires témoin/erreur réellement jugées ; indécidable ou absent = non mesurable, jamais un faux résultat. S5 teste la capacité à demander une vérification : sa flèche incertaine n’a ni note ni vérité de référence. Seuls les résultats de l’IA sont évalués, pas la validité scientifique des références. Aucun fichier image, prompt, réponse brute, endpoint ou clé API exporté.',
  };
}
