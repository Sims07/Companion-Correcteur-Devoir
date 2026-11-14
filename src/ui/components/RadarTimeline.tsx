import { useState, type ReactNode } from 'react';
import type { TimelinePoint } from '../../domain/radarTimeline.ts';
import { MethodRadarComparison } from './MethodRadarComparison.tsx';
import { Button } from '../design-system/index.ts';

const format = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('fr-FR', {maximumFractionDigits:1});
const date = (s: string) => new Date(s).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'});
const caption = (p: TimelinePoint) => date(p.date) + ' · ' + p.label + ' · ' + format(p.score) + '/100';
const measured = (p: TimelinePoint) => Object.keys(p.axes).filter(key => p.axes[key] != null).sort();
const complete = (p: TimelinePoint) => p.score != null && measured(p).length === Object.keys(p.axes).length;
const coverage = (p: TimelinePoint) => complete(p) ? 'Global' : 'Partiel · ' + measured(p).length + '/' + Object.keys(p.axes).length;
const comparable = (a: TimelinePoint, b: TimelinePoint) => !!a.comparisonBasis && a.comparisonBasis === b.comparisonBasis &&
  JSON.stringify(measured(a)) === JSON.stringify(measured(b));
const options = (items: TimelinePoint[]) => items.map(p => <option key={p.id} value={p.id}>{caption(p)}</option>);

function ScoreChart({ points, current, axis }: {points: TimelinePoint[]; current: TimelinePoint; axis: string}) {
  const first = Date.parse(points[0]!.date);
  const span = Date.parse(points.at(-1)!.date) - first;
  const x = (p: TimelinePoint) => span ? 74 + 598 * (Date.parse(p.date) - first) / span : 373;
  const y = (v: number) => 178 - 1.38 * v;
  const value = (p: TimelinePoint) => axis ? p.axes[axis] : p.score;
  if (!points.some(p => value(p) != null)) return <p>Aucune mesure enregistrée pour ce critère.</p>;
  return <figure className="lab-trend"><figcaption>{axis || 'Indice de la campagne'} <span>/ 100</span></figcaption>
    <svg viewBox="0 0 750 225" role="img" aria-label="Évolution des notes par date, sur 100">
    {[0,25,50,75,100].map(t => <g key={t}><line x1="74" x2="672" y1={y(t)} y2={y(t)} className="gridline" strokeDasharray={t ? "3 5" : undefined}/>
      <text x="63" y={y(t)+5} textAnchor="end">{t}</text></g>)}
    <line x1="74" x2="74" y1={y(0)} y2={y(100)} className="gridline"/>
    {points.map((p,i) => {
      const v = value(p);
      if (v == null) return null;
      const prev = points[i-1];
      const pv = prev && value(prev);
      return <g key={p.id}>
        {prev && pv != null && (axis ? p.label === prev.label : comparable(p,prev)) && <line x1={x(prev)} y1={y(pv)} x2={x(p)} y2={y(v)} stroke="currentColor" strokeWidth="2" strokeDasharray={axis || complete(p) ? undefined : '5 4'}/>}
        <circle cx={x(p)} cy={y(v)} r={p === current ? 6 : 4} stroke="currentColor" strokeWidth="2" fill={complete(p) ? 'currentColor' : 'var(--ds-color-surface, white)'}><title>{date(p.date)} · {p.label} · {axis || 'Indice'} {format(v)}/100 · {coverage(p)}</title></circle>
        {(p === current || points.length <= 2) && <text className="lab-point-value" x={x(p)} y={y(v)-12} textAnchor="middle">{format(v)}</text>}
      </g>;
    })}
    <text x={span ? 74 : 373} y="202" textAnchor={span ? 'start':'middle'}>{date(points[0]!.date)}</text>
    {span > 0 && <text x="672" y="202" textAnchor="end">{date(points.at(-1)!.date)}</text>}
  </svg><div className="lab-date-axis">Date de la campagne</div></figure>;
}

interface Props {
  points: TimelinePoint[]; model: string; domainLabel: string; children: ReactNode;
  onBack: () => void; onExport: () => void; selectMethod: (p: TimelinePoint) => void;
}

export function RadarTimeline({points, model, domainLabel, children, onBack, onExport, selectMethod}:Props) {
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState('');
  const [axis, setAxis] = useState('');
  const sorted = [...points].sort((a,b) => b.date.localeCompare(a.date));
  const methods = [...new Set(sorted.map(p => p.label))];
  const filtered = sorted.filter(p => !filter || p.label === filter);
  const current = filtered.find(p => p.id === selected) ?? filtered[0];
  const axes = [...new Set(sorted.flatMap(p => Object.keys(p.axes)))];
  return <section className="method-lab" aria-label="Laboratoire des méthodes">
    <nav aria-label="Fil d’Ariane"><button type="button" onClick={onBack}>Retour aux radars</button> / {domainLabel}</nav>
    <header><div><h2>Laboratoire des méthodes</h2><p>{model} · {domainLabel}</p></div>
      <Button variant="secondary" disabled={!points.length} onClick={onExport}>Exporter l’historique des méthodes</Button></header>

    {!points.length ? <p>Aucun essai enregistré pour ce modèle.</p> : <>
      <MethodRadarComparison sorted={sorted} axes={axes}/>
      <section><h3>Évolution des notes</h3>
        <div className="lab-controls"><label>Méthode affichée<select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">Toutes les méthodes</option>{methods.map(m => <option key={m}>{m}</option>)}</select></label>
          <label>Mesure affichée<select value={axis} onChange={e => setAxis(e.target.value)}><option value="">Indice de l’essai</option>{axes.map(a => <option key={a}>{a}</option>)}</select></label></div>
        {current && <ScoreChart current={current} points={[...filtered].reverse()} axis={axis}/>}
        <small>Point plein · campagne complète　○ Point creux · campagne partielle</small>
      </section>
      <section><h3>Résultats par méthode</h3><div className="lab-scroll"><table><caption>Dernier essai de chaque méthode</caption>
        <thead><tr><th>Méthode utilisée</th><th>Essais</th><th>Dernier test</th><th>Date</th><th>Indice /100</th><th>Couverture</th></tr></thead>
        <tbody>{methods.map(m => { const rows = sorted.filter(p => p.label === m); const p = rows[0]!;
          return <tr key={m}><th><button onClick={() => { setFilter(m); setSelected(p.id); }}>{m}</button></th><td>{rows.length}</td><td>{p.protocolLabel ?? 'Non renseigné'}</td><td>{date(p.date)}</td><td>{format(p.score)}</td><td>{coverage(p)}</td></tr>;
        })}</tbody></table></div></section>
      {current && <section><h3>Historique des campagnes</h3>
        <label>Essai sélectionné<select value={current.id} onChange={e => setSelected(e.target.value)}>{options(filtered)}</select></label>
        <p>{current.protocolLabel} · {coverage(current)} · {current.reconstructed ? 'Indice reconstitué' : 'Indice enregistré'} · Révision {current.revision?.slice(0,8) ?? 'inconnue'}</p>
        <div className="lab-criteria">{measured(current).map(a => <span key={a}>{a} <strong>{format(current.axes[a])}/100</strong></span>)}</div>
        <details><summary>Prompts et consignes de l’essai sélectionné</summary><p>{current.prompts.join(' · ') || 'Référence inconnue'}</p>{current.instructions?.map((s,i) => <p key={i}>{s}</p>)}</details>
        {(current.scienceMethod || current.biologyMethod) && <Button variant="secondary" onClick={() => selectMethod(current)}>Choisir cette méthode pour le prochain essai</Button>}
      </section>}
    </>}
    <section className="lab-launch">{children}</section>
  </section>;
}
