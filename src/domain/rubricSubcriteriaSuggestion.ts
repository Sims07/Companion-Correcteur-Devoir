import { getRubricSubcriteria, type RubricCriterion, type RubricSubcriterion } from './rubric.ts';
import { sumGradeScores } from './scorePrecision.ts';

/** A null maximum means the teacher did not specify points in the description. */
export interface SuggestedSubcriterion {
  title: string;
  maxPoints: number | null;
}

const pointsSuffix = /(?:\(\s*(\d+(?:[,.]\d{1,2})?)\s*(?:pts?|points?)\s*\)|[:—–-]\s*(\d+(?:[,.]\d{1,2})?)\s*(?:pts?|points?))\s*\.?$/iu;
const referenceHeading = /^(?:référence|rappel|total(?: général)?|note globale|barème total|consigne|exemple)\s*:/iu;

/** Compare user-written titles without losing their original spelling. */
export function normalizedSubcriterionTitle(title: string): string {
  return title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR');
}

/**
 * A fast, strictly local extraction of separately written expectations.
 * Split only on teacher-provided list boundaries; never split a scientific concept on "et" or commas,
 * and never invent missing point allocations.
 */
export function suggestSubcriteriaFromDescription(criterion: RubricCriterion): SuggestedSubcriterion[] {
  const fragments = criterion.description.split(/\r?\n|;/u).map((fragment) => fragment.trim()).filter(Boolean);
  if (fragments.length < 2) return [];

  const existing = new Set(getRubricSubcriteria(criterion).map((item) => normalizedSubcriterionTitle(item.title)));
  const seen = new Set<string>();
  const suggestions: SuggestedSubcriterion[] = [];

  for (const fragment of fragments) {
    const clean = fragment.replace(/^(?:(?:[-•*✓✔☑]\s+)|(?:\d+[.)]\s+))+/u, '').trim();
    if (referenceHeading.test(clean)) continue;
    const points = clean.match(pointsSuffix);
    const title = (points ? clean.slice(0, points.index) : clean).replace(/[\s.:,;–—-]+$/u, '').trim();
    if (title.length < 3) continue;
    const key = normalizedSubcriterionTitle(title);
    if (existing.has(key) || seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      title,
      maxPoints: points ? Number((points[1] ?? points[2]).replace(',', '.')) : null,
    });
  }
  return suggestions;
}

/** Applies only an explicit, fully consistent proposal, preserving every existing subcriterion. */
export function appendSuggestedSubcriteria(
  criterion: RubricCriterion,
  suggestions: SuggestedSubcriterion[],
  createId: () => string,
): Pick<RubricCriterion, 'subcriteria' | 'expectedElements'> {
  if (suggestions.length === 0) throw new Error('Aucun sous-critère à ajouter.');
  const existing = getRubricSubcriteria(criterion);
  const titles = new Set(existing.map((item) => normalizedSubcriterionTitle(item.title)));
  for (const suggestion of suggestions) {
    const key = normalizedSubcriterionTitle(suggestion.title);
    if (!key || titles.has(key)) throw new Error('Vérifiez les intitulés : un sous-critère est vide ou déjà présent.');
    titles.add(key);
    if (suggestion.maxPoints === null || !Number.isFinite(suggestion.maxPoints) || suggestion.maxPoints < 0) {
      throw new Error('Renseignez les points de chaque sous-critère.');
    }
  }
  const total = sumGradeScores([...existing.map((item) => item.maxPoints), ...suggestions.map((item) => item.maxPoints as number)]);
  if (Math.abs(total - criterion.maxPoints) > 0.0001) {
    throw new Error(`Le total des sous-critères doit être de ${criterion.maxPoints} points (actuellement ${total}).`);
  }
  const added: RubricSubcriterion[] = suggestions.map(({ title, maxPoints }) => ({
    id: createId(), title: title.trim(), description: '', maxPoints: maxPoints as number,
  }));
  return { subcriteria: [...existing, ...added], expectedElements: undefined };
}
