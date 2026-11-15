import type { TimelinePoint } from './radarTimeline.ts';

const number = (value: number) => value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** The most recent complete benchmark defines the comparison cohort. Runs on
 * other references remain in history and never vote on this recommendation. */
export function radarMethodDecision(points: readonly TimelinePoint[]) {
  const sorted = [...points].sort((a, b) => b.date.localeCompare(a.date));
  const axes = [...new Set(sorted.flatMap(point => Object.keys(point.axes)))];
  const eligible = sorted.filter(point => point.comparisonBasis && Number.isFinite(point.score)
    && axes.length && axes.every(axis => Number.isFinite(point.axes[axis])));
  const anchor = eligible[0];
  const cohort = eligible.filter(point => point.model === anchor?.model && point.comparisonBasis === anchor?.comparisonBasis);
  const methods = [...new Set(cohort.map(point => point.label))];
  const latest = methods.map(label => cohort.find(point => point.label === label)!)
    .sort((a, b) => b.score! - a.score!);
  const [first, next] = latest;
  if (!first || !next) {
    const coverage = (point: TimelinePoint) => axes.filter(axis => point.axes[axis] != null).length;
    const best = sorted.filter(point => point.score != null && coverage(point) < axes.length)
      .sort((a, b) => coverage(b) - coverage(a))[0];
    const missing = axes.filter(axis => best?.axes[axis] == null);
    const other = best?.comparisonBasis && sorted.find(point => point.model === best.model &&
      point.label !== best.label && point.score != null && point.comparisonBasis === best.comparisonBasis &&
      axes.every(axis => (point.axes[axis] == null) === (best.axes[axis] == null)));
    const detail = best ? best.label + ' · ' + number(best.score!) + '/100 sur ' + coverage(best) + '/' + axes.length +
      ' axes.' + (other ? ' Sur ce périmètre, ' + other.label + ' obtient ' + number(other.score!) + '/100.' : '') +
      ' À mesurer : ' + missing.join(', ') + '.' : 'Il faut deux méthodes complètes sur les mêmes cas, références et pondérations.';
    return { title: 'Choix encore ouvert', detail };
  }
  // Different code revisions are successive choices. Only repetitions of
  // the same revision qualify the ordering of the current representatives.
  const repeats = (p: TimelinePoint) => p.revision
    ? cohort.filter(row => row.label === p.label && row.revision === p.revision) : [p];
  const floor = Math.min(...repeats(first).map(row => row.score!));
  const rival = latest.slice(1).find(point => repeats(point).some(row => row.score! >= floor));
  if (rival) return { title: 'Méthodes au coude-à-coude', detail: first.label + ' et ' + rival.label +
    ' · les scores observés se rejoignent ou changent d’ordre.' };
  const gains = axes.filter(axis => first.axes[axis]! > next.axes[axis]!)
    .sort((a, b) => (first.axes[b]! - next.axes[b]!) - (first.axes[a]! - next.axes[a]!));
  return { winner: first, title: 'Méthode recommandée · ' + first.label, detail: number(first.score!) + '/100 · +' +
    number(first.score! - next.score!) + ' point(s) devant ' + next.label + ' parmi ' + latest.length +
    ' méthodes complètes comparables.' + (gains.length ? ' Avantage observé : ' + gains.slice(0, 2).join(', ') + '.' : '') };
}
