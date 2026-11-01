export interface RecoveredRubricCriterion { title: string; description: string; maxPoints: number; }
export interface RecoveredRubric { title: string; criteria: RecoveredRubricCriterion[]; warnings: string[]; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function parsePoints(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const points = Number(value.trim().replace(/\s*(?:pts?|points?)\s*$/i, '').replace(',', '.'));
  return Number.isFinite(points) ? points : undefined;
}
function extractObjects(raw: string, start: number): unknown[] {
  const result: unknown[] = []; let cursor = start;
  while (cursor < raw.length) {
    const begin = raw.indexOf('{', cursor); const arrayEnd = raw.indexOf(']', cursor);
    if (begin < 0 || (arrayEnd >= 0 && arrayEnd < begin)) break;
    let depth = 0; let quoted = false; let escaped = false; let end = -1;
    for (let i = begin; i < raw.length; i += 1) {
      const ch = raw[i];
      if (quoted) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') quoted = false; continue; }
      if (ch === '"') quoted = true; else if (ch === '{') depth += 1; else if (ch === '}' && --depth === 0) { end = i; break; }
    }
    if (end < 0) { cursor = begin + 1; continue; }
    try { result.push(JSON.parse(raw.slice(begin, end + 1).replace(/,\s*([}\]])/g, '$1'))); cursor = end + 1; }
    catch { cursor = begin + 1; }
  }
  return result;
}
/** Recover usable criteria even when the model response is not valid JSON. */
export function recoverRubricResponse(raw: string, fallbackTitle = 'Barème importé'): RecoveredRubric {
  const warnings: string[] = []; let parsed: unknown; let jsonValid = true;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { parsed = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1).replace(/,\s*([}\]])/g, '$1')); }
  catch { jsonValid = false; }
  const source = isRecord(parsed) ? parsed : {};
  const candidate = source.criteria ?? source.criteres ?? source.rubric;
  let entries: unknown[] = Array.isArray(candidate) ? candidate : isRecord(candidate) ? Object.values(candidate) : [];
  if (!jsonValid) {
    const key = /"(?:criteria|criteres|rubric)"\s*:/i.exec(raw);
    const arrayStart = key ? raw.indexOf('[', key.index + key[0].length) : -1;
    if (arrayStart >= 0) entries = extractObjects(raw, arrayStart + 1);
    warnings.push('La réponse JSON était mal formée ; récupération des critères lisibles effectuée.');
  }
  const criteria: RecoveredRubricCriterion[] = []; let rejected = 0;
  for (const [index, entry] of entries.entries()) {
    if (!isRecord(entry)) { rejected += 1; continue; }
    const titleValue = entry.title ?? entry.titre ?? entry.name;
    const descriptionValue = entry.description ?? entry.attendus ?? entry.details;
    const points = parsePoints(entry.maxPoints ?? entry.max_points ?? entry.points ?? entry.maximum);
    const title = typeof titleValue === 'string' ? titleValue.trim() : '';
    const description = typeof descriptionValue === 'string' ? descriptionValue.trim() : '';
    if (points === undefined || (!title && !description)) { rejected += 1; continue; }
    criteria.push({ title: title || description.slice(0, 100) || `Critère ${index + 1}`, description: description || 'À préciser par l’enseignant.', maxPoints: points });
    if (!description) warnings.push(`Description à préciser pour « ${title} ».`);
  }
  if (rejected) warnings.push(`${rejected} entrée(s) non exploitable(s) ignorée(s).`);
  if (criteria.length < entries.length) warnings.push('Le barème a été récupéré partiellement ; vérifiez les critères dans l’éditeur.');
  if (!criteria.length) throw new Error('Aucun critère exploitable n’a pu être récupéré depuis la réponse du modèle.');
  const title = typeof source.title === 'string' && source.title.trim() ? source.title.trim() : fallbackTitle;
  if (title === fallbackTitle) warnings.push('Le titre du barème n’a pas pu être identifié ; un titre par défaut a été utilisé.');
  return { title, criteria, warnings: [...new Set(warnings)] };
}
