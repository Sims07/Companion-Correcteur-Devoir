/** A single teacher action cue replaces the overlapping diagnostic chips.
 * Point deductions are already visible in the score breakdown: they do not
 * need a second warning. The AI's text is kept as an observation, not rewritten
 * into a fabricated question.
 */
export interface TeacherReviewCue {
  title: string;
  message: string;
}

interface TeacherReviewCueInput {
  reasons: readonly string[];
  questionForTeacher?: string | null;
  hasPendingSubcriteria?: boolean;
}

export function getTeacherReviewCue({
  reasons, questionForTeacher, hasPendingSubcriteria = false,
}: TeacherReviewCueInput): TeacherReviewCue | null {
  // Each unresolved subcriterion already carries its own precise request.
  if (hasPendingSubcriteria) return null;

  const question = questionForTeacher?.trim();
  if (question) {
    return { title: 'À confirmer sur la copie', message: question };
  }
  if (reasons.includes('Non évalué')) {
    return { title: 'Note à renseigner', message: 'L’IA n’a pas pu évaluer ce critère. Examinez la copie et attribuez les points.' };
  }
  if (reasons.includes('Lecture difficile')) {
    return { title: 'Lecture à vérifier', message: 'L’IA signale un passage difficile à lire. Contrôlez-le directement sur la copie.' };
  }
  if (reasons.includes('Confiance faible') || reasons.includes('Confiance à vérifier')) {
    return { title: 'Interprétation à confirmer', message: 'L’IA reste incertaine sur ce critère. Comparez les éléments repérés à la copie.' };
  }

  // Missing evidence is already explicitly shown in the evidence section.
  // A deduction by itself is not an additional, separate teacher request.
  return null;
}

function comparable(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('fr-FR').replace(/\s*[.!?]+\s*$/u, '').trim();
}

/** Keep an actual explanation only when it adds information to the already-visible proof. */
export function usefulTeacherRationale(
  rationale: string,
  evidence = '',
  questionForTeacher = '',
): string | null {
  const trimmed = rationale.trim();
  if (!trimmed || comparable(trimmed) === 'justification non fournie') return null;
  if (comparable(trimmed) === comparable(evidence) || comparable(trimmed) === comparable(questionForTeacher)) return null;
  return trimmed;
}
