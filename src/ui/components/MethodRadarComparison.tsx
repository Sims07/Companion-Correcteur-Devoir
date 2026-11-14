import { useState } from 'react';
import { RADAR_AXES } from '../../domain/diagramLabRadar.ts';
import type { TimelinePoint } from '../../domain/radarTimeline.ts';

const shortLabels = new Map<string,string>([
  ...RADAR_AXES.map(a => [a.label, a.short] as [string,string]),
  ['Justesse de la note','Note'], ['Respect du barème','Barème'],
  ['Bonnes réponses reconnues','Bonnes réponses'], ['Erreurs détectées','Erreurs'],
]);
const number = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('fr-FR', {maximumFractionDigits:1});
const colors = ['#216878','#a04932'];
const isFull = (p: TimelinePoint, axes: string[]) => axes.length > 0 && axes.every(a => p.axes[a] != null);
function position(i: number, count: number, radius: number) {
  const angle = i * 2 * Math.PI / count - Math.PI / 2;
  return {x:200 + radius * Math.cos(angle), y:144 + radius * Math.sin(angle)};
}

export function MethodRadarComparison({sorted, axes}: {sorted:TimelinePoint[]; axes:string[]}) {
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [protocol, setProtocol] = useState('');
  const protocols = [...new Set(sorted.flatMap(p => p.protocolLabel ? [p.protocolLabel] : []))];
  const activeProtocol = protocols.includes(protocol) ? protocol : '';
  const candidates = activeProtocol ? sorted.filter(p => p.protocolLabel === activeProtocol) : sorted;
  const methods = [...new Set(candidates.map(p => p.label))];
  // Start with the latest complete campaign for each method, even after a targeted rerun.
  const representatives = methods.map(m => candidates.find(p => p.label === m && isFull(p, axes)) ?? candidates.find(p => p.label === m)!);
  const preferred = [...representatives].sort((a,b) => Number(isFull(b,axes)) - Number(isFull(a,axes)) || b.date.localeCompare(a.date));
  const first = preferred.find(p => p.label === primary) ?? preferred[0]!;
  const alternatives = preferred.filter(p => p !== first);
  const second = alternatives.find(p => p.label === secondary) ?? alternatives[0];
  const series = second ? [first, second] : [first];
  const ring = (r:number) => axes.map((_,i) => position(i,axes.length,r)).map(p => p.x+','+p.y).join(' ');
  return <section className="lab-radar"><h3>Comparer les radars par méthode</h3>
    <label className="lab-scope">Campagnes comparées<select value={activeProtocol} onChange={e => setProtocol(e.target.value)}>
      <option value="">Radar complet en priorité</option>{protocols.map(name => <option key={name}>{name}</option>)}</select></label>
    <div className="lab-radar-layout"><div className="lab-method-series">{series.map((p,index) =>
      <div key={index} className={'lab-series series-'+index}>
        <label htmlFor={'lab-method-'+index}>{index ? 'Méthode B' : 'Méthode A'}</label>
        <select id={'lab-method-'+index} value={p.label} onChange={e => {
          if (index) setSecondary(e.target.value);
          else { if (e.target.value === second?.label) setSecondary(first.label); setPrimary(e.target.value); }
        }}>{(index ? alternatives : preferred).map(row => <option key={row.label}>{row.label}</option>)}</select>
        <strong>{number(p.score)} <small>/ 100</small></strong>
        <span>{isFull(p,axes) ? 'Dernier radar complet' : 'Dernier radar partiel'} · {axes.filter(a => p.axes[a] != null).length}/{axes.length} axes</span>
        <time dateTime={p.date}>{new Date(p.date).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})}</time>
      </div>)}{!second && <p>Une seule méthode évaluée pour ce modèle.</p>}</div>
      <figure><svg viewBox="0 0 400 282" role="img" aria-label="Radars superposés des méthodes sur 100">
        {[25,50,75,100].map(t => <polygon key={t} points={ring(t * 1.02)} className="lab-ring"/>)}
        {axes.map((a,i) => { const end = position(i,axes.length,102); const label = position(i,axes.length,117);
          return <g key={a}><line x1="200" y1="144" x2={end.x} y2={end.y} className="lab-ring"/>
            <text x={label.x} y={label.y+4} textAnchor={Math.abs(label.x-200)<1 ? 'middle' : label.x>200 ? 'start':'end'}>{shortLabels.get(a) ?? a}</text></g>;
        })}
        {series.map((p,index) => {
          const vertices = axes.flatMap((a,i) => p.axes[a] == null ? [] : [{axis:a,...position(i,axes.length,p.axes[a]! * 1.02)}]);
          return <g key={p.label} data-method={p.label} stroke={colors[index]} fill={colors[index]}>
            {isFull(p,axes) && <polygon points={vertices.map(v => v.x+','+v.y).join(' ')} fillOpacity=".09" strokeWidth="2.6" strokeDasharray={index ? '6 4' : undefined}/>}
            {vertices.map(v => <circle key={v.axis} cx={v.x} cy={v.y} r={index ? 3 : 4.5} fill={index ? 'white' : colors[index]} strokeWidth="2"><title>{p.label} · {v.axis} · {number(p.axes[v.axis])}/100</title></circle>)}</g>;
        })}
      </svg><figcaption>Du centre au bord · 0 à 100 par pas de 25</figcaption></figure></div>
      <details><summary>Valeurs par critère{second && ' et écarts entre méthodes'}</summary>
        <div className="lab-scroll"><table><thead><tr><th>Critère /100</th><th>Méthode A</th>{second && <><th>Méthode B</th><th>B − A</th></>}</tr></thead>
        <tbody>{axes.map(a => {const aScore=first.axes[a], bScore=second?.axes[a];
          const gap=aScore!=null && bScore!=null ? Math.round((bScore-aScore)*10)/10 : null;
          return <tr key={a}><th>{a}</th><td>{number(aScore)}</td>{second && <><td>{number(bScore)}</td><td>{gap!=null && gap>0 ? '+' : ''}{number(gap)}</td></>}</tr>;})}</tbody></table></div></details>
    </section>;
}
