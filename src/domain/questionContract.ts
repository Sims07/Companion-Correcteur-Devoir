import type { RubricCriterion } from './rubric.ts';

/** Teacher-owned context, prepared once; observations never create new point units. */
export interface CorrectionContract {
  question?: { id: string; instruction: string };
  expectedRelation: string;
  acceptedAlternatives: string;
  contradictions: string;
}

export function parseCorrectionContract(value: unknown): CorrectionContract | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Contrat de correction invalide.');
  const raw = value as Record<string, unknown>;
  for (const key of ['expectedRelation', 'acceptedAlternatives', 'contradictions']) {
    if (typeof raw[key] !== 'string') throw new Error('Le contrat doit contenir des relations, équivalences et contradictions textuelles.');
  }
  let question: CorrectionContract['question'];
  if (raw.question !== undefined) {
    const q = raw.question as Record<string, unknown> | null;
    if (!q || typeof q !== 'object' || typeof q.id !== 'string' || !/^\d+(?:[.][\da-z]+)*[a-z]?$/i.test(q.id) || typeof q.instruction !== 'string' || !q.instruction.trim()) {
      throw new Error('La question doit avoir un numéro (ex. 1, 2a, 1.2) et une consigne.');
    }
    question = { id: q.id, instruction: q.instruction };
  }
  return { ...(question ? { question } : {}), expectedRelation: raw.expectedRelation as string, acceptedAlternatives: raw.acceptedAlternatives as string, contradictions: raw.contradictions as string };
}

/** Explicit question headings only. Never infer a missing answer or use the subject as evidence. */
export function questionAnswer(transcription: string, id: string): string {
  const headings = [...transcription.matchAll(/^[ \t]*(?:#{1,6}\s*)?(?:Question\s+|Q\s*)(\d+(?:[.][\da-z]+)*[a-z]?)[ \t]*[:.)]?[ \t]*\r?$/gim)];
  const matches = headings.filter((heading) => heading[1].toLowerCase() === id.toLowerCase());
  if (matches.length !== 1) throw new Error(`Question ${id} : rattachement à vérifier (${matches.length ? 'repère répété' : 'repère absent'}). Aucune note calculée. Utilisez « Question ${id} » puis « Réponse : » dans la transcription vérifiée.`);
  const heading = matches[0];
  const next = headings[headings.indexOf(heading) + 1];
  const block = transcription.slice(heading.index! + heading[0].length, next?.index ?? transcription.length);
  const answerMarkers = [...block.matchAll(/^[ \t]*R[eé]ponse(?:\s+de\s+l['’](?:étudiant|élève))?[ \t]*:[ \t]*/gim)];
  if (answerMarkers.length !== 1) throw new Error(`Question ${id} : distinguez l’énoncé et la réponse avec un seul repère « Réponse : ». Aucune note calculée.`);
  const marker = answerMarkers[0];
  const answer = block.slice(marker.index! + marker[0].length).trim();
  if (!answer) throw new Error(`Question ${id} : réponse vide à vérifier, aucune absence déduite automatiquement.`);
  return answer;
}

export function contractContext(contract?: CorrectionContract): string {
  if (!contract) return '';
  return [
    'CONTRAT DU PROFESSEUR (contexte du critère ; les unités et points restent ceux du barème) : ' + JSON.stringify(contract),
    'Évalue chaque attendu dans son propre périmètre. Une équivalence est une alternative, pas une obligation supplémentaire. Vérifie les relations complètes, leur sens et les négations. Une contradiction concerne seulement l’attendu qu’elle contredit. N’ajoute aucun point ni pénalité ; ne décompose pas une relation causale en mots-clés indépendants.',
  ].join('\n');
}

export function scopedCriterionInput(criterion: RubricCriterion, transcription: string, question: string) {
  const contract = parseCorrectionContract(criterion.correctionContract);
  return {
    transcription: contract?.question ? questionAnswer(transcription, contract.question.id) : transcription,
    question: contract?.question ? contract.question.instruction : question,
  };
}

export function questionGroups(criteria: RubricCriterion[], transcription: string, question: string) {
  const groups: Array<{ criteria: RubricCriterion[]; transcription: string; question: string }> = [];
  const byScope = new Map<string, typeof groups[number]>();
  for (const criterion of criteria) {
    const input = scopedCriterionInput(criterion, transcription, question);
    const key = JSON.stringify([criterion.correctionContract?.question?.id ?? null, input.question]);
    const group = byScope.get(key);
    if (group) group.criteria.push(criterion);
    else { const next = { criteria: [criterion], ...input }; byScope.set(key, next); groups.push(next); }
  }
  return groups;
}
