import { BIOLOGY_RADAR_AXES, type BiologyRadarCandidate } from '../../domain/biologyTeacherRadar.ts';
import { RADAR_COMPARISON_COLORS } from './RadarComparisonPalette.ts';

/** Draw multiple results from the same biological protocol without filling missing axes with zeroes. */
export function BiologyRadarComparisonPlot({ candidates }: { candidates: BiologyRadarCandidate[] }) {
  const vertex = (index: number, value: number): [number, number] => {
    const angle = 2 * Math.PI * index / BIOLOGY_RADAR_AXES.length - Math.PI / 2;
    return [260 + 112 * value * Math.cos(angle), 157 + 112 * value * Math.sin(angle)];
  };
  const points = (values: number[]) =>
    values.map((value, index) => vertex(index, value).join(',')).join(' ');

  return <svg viewBox="0 0 520 330" role="img" className="biology-radar-plot"
    aria-label={'Comparaison biologique (contrat par question) : ' +
      candidates.map((candidate) => candidate.name + ', ' + candidate.measured + ' axes sur 5').join(' ; ')}>
    {[0.25, 0.5, 0.75, 1].map((level) =>
      <polygon key={level} points={points(BIOLOGY_RADAR_AXES.map(() => level))}
        fill="none" stroke="currentColor" strokeOpacity=".17" />)}
    {BIOLOGY_RADAR_AXES.map((axis, index) => {
      const [x, y] = vertex(index, 1);
      const [labelX, labelY] = vertex(index, 1.3);
      return <g key={axis.id}>
        <line x1="260" y1="157" x2={x} y2={y} stroke="currentColor" strokeOpacity=".17" />
        <text x={labelX} y={labelY} fill="currentColor"
          textAnchor={index === 0 ? 'middle' : index < 3 ? 'start' : 'end'} fontSize="12">
          {['Note professeur', 'Barème', 'Bonnes réponses', 'Erreurs', 'Cas pièges'][index]}
        </text>
      </g>;
    })}
    {candidates.map((candidate, candidateIndex) => {
      const color = RADAR_COMPARISON_COLORS[candidateIndex % RADAR_COMPARISON_COLORS.length]!;
      const values = BIOLOGY_RADAR_AXES.map((axis) => candidate.axes[axis.id]);
      const coordinates = values.map((value, index) => value === null ? null : vertex(index, value / 100));
      const complete = values.every((value) => value !== null);
      return <g key={candidate.id} data-radar-model={candidate.id}>
        {complete
          ? <polygon points={points(values.map((value) => value! / 100))}
              fill={color} fillOpacity=".12" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
          : coordinates.map((from, index) => {
              const to = coordinates[(index + 1) % coordinates.length];
              return from && to
                ? <line key={index} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]}
                    stroke={color} strokeWidth="2.5" strokeDasharray="6 4" />
                : null;
            })}
        {coordinates.map((xy, index) => xy
          ? <circle key={index} cx={xy[0]} cy={xy[1]} r="3.5" fill={color}
              stroke="var(--ds-color-surface)" strokeWidth="1" />
          : null)}
      </g>;
    })}
  </svg>;
}
