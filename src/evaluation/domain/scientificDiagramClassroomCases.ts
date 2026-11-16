/**
 * Classroom-like synthetic drawings generated as raster images before this
 * benchmark was created. Their artwork is bundled as WebP files in
 * src/evaluation/assets/pilot/ and must never be reconstructed from SVG.
 *
 * No student's source image, handwriting, identifying details or teacher grade
 * is part of the repository. Expected observations are provisional and must
 * be validated against the actual bundled pixels, not an earlier vector draft.
 */
export type ClassroomCaseId = 'R1' | 'R2' | 'R3';
export const CLASSROOM_CASE_IDS = ['R1', 'R2', 'R3'] as const;

export interface ClassroomScenario {
  id: ClassroomCaseId;
  label: string;
  expectedFindings: readonly string[];
  phases: readonly ('interphase' | 'prophase' | 'metaphase' | 'anaphase' | 'telophase')[];
  synthetic: true;
  teacherValidated: false;
}

export const CLASSROOM_SCENARIOS: readonly ClassroomScenario[] = [
  {
    id: 'R1', label: 'R1 — présentation soignée, étape oubliée',
    synthetic: true, teacherValidated: false,
    phases: ['prophase', 'metaphase', 'anaphase', 'telophase'],
    expectedFindings: [
      'Interphase obligatoire absente malgré quatre panneaux lisibles.',
      'Titre soigné et souligné, mais placé au-dessus des dessins et non en dessous.',
      'Légendes et traits de rappel généralement lisibles : ne pas confondre omission de phase et graphisme.',
    ],
  },
  {
    id: 'R2', label: 'R2 — confusions de structures et de pointage',
    synthetic: true, teacherValidated: false,
    phases: ['interphase', 'prophase', 'anaphase', 'telophase'],
    expectedFindings: [
      'En interphase, le mot « chromosome » pointe vers le contenu du noyau, sans chromosome individualisé visible.',
      'En anaphase, la « membrane plasmique » est désignée sur un contour externe difficile à distinguer de la paroi.',
      'En télophase, deux masses nucléaires sont esquissées sans plaque cellulaire centrale identifiable.',
      'Titre au-dessus, sans organe ni organisme ni mention de coupe ; représentation de paroi simplifiée.',
    ],
  },
  {
    id: 'R3', label: 'R3 — erreurs propres à la métaphase',
    synthetic: true, teacherValidated: false,
    phases: ['prophase', 'metaphase', 'anaphase', 'telophase'],
    expectedFindings: [
      'Interphase obligatoire absente.',
      'Une enveloppe nucléaire est dessinée et étiquetée en métaphase : incohérence biologique.',
      'La légende « microtubules » est présente, mais aucun fuseau individualisé n’est nettement visible à sa destination.',
      'Titre complet et souligné mais au-dessus, et plusieurs chromosomes correctement représentés à valoriser.',
    ],
  },
] as const;
