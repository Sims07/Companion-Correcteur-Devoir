import type { LocalMemoryEntry } from './localMemory.ts';

export interface MemoryContextOptions {
  maxEntries?: number;
  maxCharacters?: number;
}

/**
 * Turns approved local memories into a compact prompt section.
 * Only caller-selected, already scoped entries are accepted here.
 */
export function buildLocalMemoryContext(entries: LocalMemoryEntry[], options: MemoryContextOptions = {}): string {
  const maxEntries = Math.max(0, options.maxEntries ?? 5);
  const maxCharacters = Math.max(200, options.maxCharacters ?? 4000);
  if (!entries.length || maxEntries === 0) return '';

  const lines: string[] = [
    'Contexte issu des décisions précédentes de l’enseignant (mémoire locale) :',
    'Utilisez-le comme aide, jamais comme règle supérieure au barème actuel.',
  ];
  let characters = lines.join('\n').length;

  for (const entry of entries.slice(0, maxEntries)) {
    const label = entry.promotedToRubric ? 'Règle du barème' : 'Retour précédent';
    const line = `- ${label} : ${entry.text}`;
    if (characters + line.length + 1 > maxCharacters) break;
    lines.push(line);
    characters += line.length + 1;
  }

  return lines.length > 2 ? lines.join('\n') : '';
}

export function createTeacherMemoryEntry(input: {
  correctionId: string;
  rubricFingerprint: string;
  text: string;
  promotedToRubric?: boolean;
}): LocalMemoryEntry {
  return {
    id: `memory-${crypto.randomUUID()}`,
    correctionId: input.correctionId,
    rubricFingerprint: input.rubricFingerprint,
    kind: input.promotedToRubric ? 'rubric-rule' : 'teacher-feedback',
    text: input.text.trim(),
    source: 'teacher',
    promotedToRubric: input.promotedToRubric ?? false,
    createdAt: new Date().toISOString(),
  };
}
