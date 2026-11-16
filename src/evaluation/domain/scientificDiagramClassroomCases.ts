/**
 * Three fully synthetic microscopy drawings for testing classroom-like failures.
 * No original student image, text, handwriting or teacher markup is included.
 * These are new, deterministic vector images, rasterized locally before any AI call.
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
      'Interphase obligatoire absente malgré quatre panneaux correctement dessinés.',
      'Les quatre noms de phases ne prouvent pas le respect de la consigne.',
      'Conserver le crédit des structures et des traits de rappel corrects.',
    ],
  },
  {
    id: 'R2', label: 'R2 — confusions de structures et de pointage',
    synthetic: true, teacherValidated: false,
    phases: ['anaphase', 'interphase', 'prophase', 'telophase'],
    expectedFindings: [
      'Paroi représentée par un contour simple, non par un double trait.',
      'Une légende « cytoplasme » arrive sur le noyau : texte plausible, cible fausse.',
      'Cellule en télophase sans cloisonnement central identifiable.',
      'Dessin irrégulier et titre insuffisant : ne pas tout convertir en erreurs biologiques.',
    ],
  },
  {
    id: 'R3', label: 'R3 — erreurs propres à la métaphase',
    synthetic: true, teacherValidated: false,
    phases: ['prophase', 'metaphase', 'anaphase', 'telophase'],
    expectedFindings: [
      'Interphase obligatoire absente.',
      'Une membrane nucléaire est dessinée et étiquetée en métaphase : incohérence scientifique.',
      'Une légende « microtubules » prétend identifier un élément non distinctement visible au microscope optique.',
      'Des chromosomes reconnaissables doivent rester valorisés.',
    ],
  },
] as const;

type Phase = ClassroomScenario['phases'][number];

function escapeXml(raw: string): string {
  return raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const path = (d: string, weight = 2.6) =>
  '<path d="' + d + '" fill="none" stroke="#404044" stroke-width="' + weight + '" stroke-linecap="round" stroke-linejoin="round"/>';
const label = (x: number, y: number, value: string) =>
  '<text x="' + x + '" y="' + y + '" font-size="20" fill="#333" font-family="Comic Sans MS, cursive">' + escapeXml(value) + '</text>';

function cellPhase(phase: Phase, variant: ClassroomCaseId): string {
  let body = '';
  if (phase === 'interphase') {
    body += '<ellipse cx="174" cy="140" rx="69" ry="55" fill="none" stroke="#444" stroke-width="2.8"/>';
    body += '<ellipse cx="163" cy="133" rx="41" ry="30" fill="#dedede" stroke="#444" stroke-width="1.8"/>';
    body += '<circle cx="181" cy="143" r="8" fill="#777"/>';
  }
  if (phase === 'prophase') {
    body += '<ellipse cx="174" cy="140" rx="74" ry="56" fill="none" stroke="#777" stroke-width="2"/>';
    body += path('M124 120 Q145 92 157 122 T191 107 M132 157 Q157 130 173 158 T213 149 M154 91 Q177 118 200 91 M112 143 Q133 174 151 162 M205 168 Q221 149 228 124', 4);
  }
  if (phase === 'metaphase') {
    if (variant === 'R3') {
      // Deliberately incorrect: a closed nuclear envelope is preserved in metaphase.
      body += '<ellipse cx="174" cy="140" rx="86" ry="66" fill="none" stroke="#555" stroke-width="3.2"/>';
    }
    for (const x of [126, 153, 180, 207, 234]) {
      body += path('M' + (x - 8) + ' 105 L' + (x + 8) + ' 169 M' + (x + 8) + ' 105 L' + (x - 8) + ' 169', 4.5);
    }
  }
  if (phase === 'anaphase') {
    for (const y of [98, 133, 166]) {
      body += path('M128 ' + (y - 9) + ' L101 ' + y + ' L129 ' + (y + 11), 4.5);
      body += path('M219 ' + (y - 9) + ' L246 ' + y + ' L218 ' + (y + 11), 4.5);
    }
  }
  if (phase === 'telophase') {
    for (const x of [118, 236]) {
      body += '<ellipse cx="' + x + '" cy="140" rx="51" ry="49" fill="#f6f6f6" stroke="#777" stroke-width="2.2"/>';
      body += path('M' + (x - 20) + ' 132 q13 -22 28 -5 t9 28', 2.8);
    }
    if (variant !== 'R2') body += path('M175 74 L174 198', 5);
  }
  return body;
}

function panel(phase: Phase, variant: ClassroomCaseId, index: number): string {
  const tx = index % 2 === 0 ? 18 : 625;
  const ty = index < 2 ? 105 : 413;
  const rough = variant === 'R2';
  const cellOutline = rough
    ? path('M49 72 Q62 48 105 60 L294 63 Q329 76 311 125 L325 206 Q306 235 271 223 L80 220 Q39 219 49 170 Z', 3.6)
    : path('M55 70 Q63 62 85 63 L289 65 Q317 67 315 91 L314 198 Q315 224 292 225 L73 223 Q51 223 53 198 Z', 2.6);
  const wall = !rough ? path('M65 79 L303 78 L301 212 L65 211 Z', 2.1) : '';
  // Start each leader line on the actual named structure (not on the cell wall).
  const firstTarget = phase === 'interphase' ? [174, 140]
    : phase === 'prophase' ? [199, 122]
      : phase === 'metaphase' ? [208, 137]
        : phase === 'anaphase' ? [218, 133] : [236, 140];
  let legends = path('M' + firstTarget[0] + ' ' + firstTarget[1] + ' L375 110', 2);
  legends += label(380, 115, phase === 'interphase' ? 'noyau' : phase === 'telophase' ? 'noyau fils' : 'chromosomes');
  if (variant === 'R2' && phase === 'interphase') {
    // Endpoint of the cytoplasm leader is deliberately in the nucleus.
    legends += path('M174 145 L412 150', 2);
    legends += label(416, 157, 'cytoplasme');
  } else if (variant === 'R3' && phase === 'metaphase') {
    legends += path('M260 140 L413 151', 2);
    legends += label(418, 157, 'membrane nucléaire');
    legends += path('M282 185 L375 187', 2);
    legends += label(380, 194, 'microtubules');
  } else {
    legends += path('M311 192 L' + (rough ? 412 : 375) + ' 151', 2);
    legends += label(rough ? 416 : 380, 157, rough ? 'membrane' : 'paroi cellulaire');
  }
  return '<g transform="translate(' + tx + ' ' + ty + ')">' +
    '<rect x="8" y="10" width="570" height="294" fill="none" stroke="#e6e6e6" stroke-width="1.5"/>' +
    cellOutline + wall + cellPhase(phase, variant) + legends +
    label(135, 268, phase.toUpperCase()) + '</g>';
}

/**
 * Artificial worksheet; entirely new geometry, never traced from a private copy.
 * No arrowheads: microscope drawings use plain leader lines.
 */
export function classroomScenarioSvg(id: ClassroomCaseId): string {
  const scenario = CLASSROOM_SCENARIOS.find((entry) => entry.id === id);
  if (!scenario) throw new Error('Cas synthétique inconnu');
  const heading = id === 'R1'
    ? 'Dessin d’observation de la mitose — coupe de racine de jacinthe (MO, ×400)'
    : id === 'R2' ? 'Mitoses' : 'Mitose : cellule végétale';
  const headingY = id === 'R1' ? 786 : 60;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="840" viewBox="0 0 1240 840" aria-label="Dessin de mitose entièrement synthétique">' +
    '<rect width="1240" height="840" fill="#fff"/>' +
    label(id === 'R2' ? 65 : 130, headingY, heading) +
    (id === 'R1' ? path('M135 796 L1100 796', 1.5) : '') +
    scenario.phases.map((phase, index) => panel(phase, id, index)).join('') +
    '</svg>';
}

export function classroomScenarioPreview(id: ClassroomCaseId): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(classroomScenarioSvg(id));
}
