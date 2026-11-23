import type { BiologyRadarCandidate, BiologyRadarObservation } from './biologyTeacherRadar.ts';

function latestPassages(history: readonly BiologyRadarObservation[], candidate: BiologyRadarCandidate) {
  const passages = new Map<string, BiologyRadarObservation>();
  for (const item of history) {
    if (item.model !== candidate.name || item.profileId !== candidate.profileId || item.provider !== candidate.provider
      || item.method !== candidate.method || item.protocol !== candidate.protocol) continue;
    const key = JSON.stringify([item.caseId, item.repetition ?? null]);
    const old = passages.get(key);
    if (!old || item.recordedAt > old.recordedAt) passages.set(key, item);
  }
  return passages;
}

export function compareBiologyReaders(history: readonly BiologyRadarObservation[], first: BiologyRadarCandidate, second: BiologyRadarCandidate) {
  const left = latestPassages(history, first), right = latestPassages(history, second);
  const rows: { caseId: string; repetition?: number; id: string; expected: number; first: number | null; second: number | null }[] = [];
  const passages: { first: BiologyRadarObservation; second: BiologyRadarObservation }[] = [];
  let excluded = 0;
  for (const key of new Set([...left.keys(), ...right.keys()])) {
    const a = left.get(key), b = right.get(key);
    if (!a || !b || a.protocol !== b.protocol || a.referenceScore !== b.referenceScore ||
      (a.revision && b.revision && a.revision !== b.revision)) { excluded++; continue; }
    const references = new Map<string,number>();
    let conflict = false;
    for (const run of [a,b]) {
      const ids = new Set<string>();
      for (const d of run.decisions) {
        if (ids.has(d.id) || (references.has(d.id) && references.get(d.id) !== d.expected)) conflict = true;
        references.set(d.id,d.expected);
        ids.add(d.id);
      }
    }
    if (references.size !== 10 || conflict) { excluded++; continue; }
    passages.push({ first:a, second:b });
    for (const [id, expected] of references) {
      const awarded = (run: BiologyRadarObservation) => run.status === 'success'
        ? run.decisions.find(d => d.id === id)?.awarded ?? null : null;
      rows.push({ caseId:a.caseId, repetition:a.repetition, id, expected, first:awarded(a), second:awarded(b) });
    }
  }
  return { rows, passages, excluded };
}

export function biologyReadingMetrics(result: ReturnType<typeof compareBiologyReaders>, reader: 'first' | 'second') {
  const runs = result.passages.map(p => p[reader]);
  const errors = runs.flatMap(r => r.status === 'success' && r.score !== null ? [Math.abs(r.score-r.referenceScore)] : []);
  const durations = runs.flatMap(r => typeof r.durationMs === 'number' && Number.isFinite(r.durationMs) ? [r.durationMs/1000] : []);
  const mean = (values: number[]) => values.length ? values.reduce((a,b) => a+b,0)/values.length : null;
  return { correct: result.rows.filter(r => r[reader] === r.expected).length,
    wrong: result.rows.filter(r => r[reader] !== null && r[reader] !== r.expected).length,
    missing: result.rows.filter(r => r[reader] === null).length, error: mean(errors), grades: errors.length,
    seconds: mean(durations), timed: durations.length };
}
