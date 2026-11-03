/** Extracts one complete JSON object/array from common small-model wrappers. */
export function parseModelJson(raw: string): unknown {
  const source = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim()
    .replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\s*\x60{3}$/, '');
  const start = source.search(/[{\[]/);
  if (start < 0) throw new Error('La réponse du modèle ne respecte pas le format JSON attendu : aucun objet JSON n’a été trouvé.');
  const first = source[start];
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') stack.push('}');
    else if (character === '[') stack.push(']');
    else if (character === '}' || character === ']') {
      if (stack.pop() !== character) throw new Error('La réponse du modèle contient un JSON invalide.');
      if (stack.length === 0) {
        try { return JSON.parse(source.slice(start, index + 1)) as unknown; }
        catch { throw new Error('La réponse du modèle contient un JSON invalide.'); }
      }
    }
  }
  if (first === '{' || first === '[') throw new Error('Réponse tronquée : le JSON du modèle est incomplet.');
  throw new Error('La réponse du modèle ne contient aucun objet JSON complet.');
}
