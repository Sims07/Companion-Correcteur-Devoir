export type LocalMemoryKind = 'teacher-feedback' | 'rubric-rule' | 'correction-example';

export interface LocalMemoryEntry {
  id: string;
  correctionId: string;
  rubricFingerprint: string;
  kind: LocalMemoryKind;
  text: string;
  source: 'teacher' | 'ai';
  promotedToRubric: boolean;
  createdAt: string;
}

export interface LocalMemoryQuery {
  correctionId?: string;
  rubricFingerprint?: string;
  limit?: number;
}

function normalize(value: string): string[] {
  return value
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

/**
 * Creates a stable browser-local key for a rubric. It deliberately excludes
 * teacher feedback so feedback cannot silently change the identity of a rubric.
 */
export function fingerprintRubric(title: string, rubricJson: string): string {
  const input = `${title.trim()}\n${rubricJson.trim()}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `rubric-${(hash >>> 0).toString(16)}`;
}

/**
 * Lightweight local retrieval used before introducing a vector embedding model.
 * It is intentionally scoped to the active correction and/or exact rubric.
 */
export function rankLocalMemories(entries: LocalMemoryEntry[], query: string, limit = 5): LocalMemoryEntry[] {
  const queryTokens = new Set(normalize(query));
  if (!queryTokens.size) return [];

  return entries
    .map((entry) => {
      const tokens = new Set(normalize(entry.text));
      const overlap = [...queryTokens].filter((token) => tokens.has(token)).length;
      return { entry, score: overlap / queryTokens.size };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || right.entry.createdAt.localeCompare(left.entry.createdAt))
    .slice(0, Math.max(0, limit))
    .map(({ entry }) => entry);
}
