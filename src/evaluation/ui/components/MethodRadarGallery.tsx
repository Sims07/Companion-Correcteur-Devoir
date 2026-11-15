import type { TimelinePoint } from '../../domain/radarTimeline.ts';

const format = (value: number | null) => value === null ? '—' :
  value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const complete = (point: TimelinePoint) =>
  Object.values(point.axes).length > 0 && Object.values(point.axes).every(value => value !== null);

/** One independent radar per saved method, even if the campaign only produced
 * partial evidence. The A/B overlay above remains available for close analysis. */
export function MethodRadarGallery({ points, selectedId, onSelect }: {
  points: readonly TimelinePoint[];
  selectedId: string;
  onSelect: (point: TimelinePoint) => void;
}) {
  const labels = [...new Set(points.map(point => point.label))];
  const representatives = labels.map(label =>
    points.find(point => point.label === label && complete(point)) ??
    points.find(point => point.label === label)!);
  const position = (axis: number, total: number, radius: number) => {
    const angle = 2 * Math.PI * axis / total - Math.PI / 2;
    return { x: 110 + radius * Math.cos(angle), y: 98 + radius * Math.sin(angle) };
  };
  return <section className="lab-radar-gallery" aria-label="Tous les radars par méthode">
    <h3>Tous les radars par méthode</h3>
    <p>Chaque méthode garde son propre radar. Sélectionnez-en un pour retrouver sa campagne et ses mesures.</p>
    <div className="lab-radar-gallery-grid">
      {representatives.map(point => {
        const axes = Object.entries(point.axes);
        const measured = axes.filter(([, score]) => score !== null);
        const isComplete = complete(point);
        const vertices = axes.map(([key, score], index) =>
          score === null ? null : {key, ...position(index, axes.length, 72 * score / 100)});
        return <button type="button" key={point.label}
          className="lab-radar-gallery-card" aria-pressed={selectedId === point.id}
          onClick={() => onSelect(point)}>
          <strong>{point.label}</strong>
          <span>{format(point.score)} / 100 · {isComplete ? 'Complet' : 'Partiel'} · {measured.length}/{axes.length} axes</span>
          <svg viewBox="0 0 220 196" role="img"
            aria-label={'Radar de la méthode ' + point.label + ' : ' + measured.length + '/' + axes.length + ' axes mesurés'}>
            {[25,50,75,100].map(percent => <polygon key={percent} className="lab-gallery-ring"
              points={axes.map((_, i) => {
                const value = position(i, axes.length, 72 * percent / 100);
                return value.x + ',' + value.y;
              }).join(' ')}/>)}
            {axes.map(([label], index) => {
              const tip = position(index, axes.length, 72);
              return <line key={label} className="lab-gallery-ring" x1="110" y1="98" x2={tip.x} y2={tip.y}/>;
            })}
            {isComplete && <polygon className="lab-gallery-data"
              points={vertices.map(value => value!.x + ',' + value!.y).join(' ')}/>}
            {vertices.filter((value): value is NonNullable<typeof value> => value !== null)
              .map(value => <circle key={value.key} cx={value.x} cy={value.y} r="3.8" className="lab-gallery-dot">
                <title>{value.key} : {format(point.axes[value.key] ?? null)} / 100</title>
              </circle>)}
          </svg>
          <small>{new Date(point.date).toLocaleString('fr-FR', {dateStyle:'short',timeStyle:'short'})}</small>
        </button>;
      })}
    </div>
  </section>;
}
