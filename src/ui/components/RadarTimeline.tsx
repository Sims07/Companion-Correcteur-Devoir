import { useEffect, useRef, useState, type ReactNode } from 'react';
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

function ScoreChart({ points, current, axis, select }: {
  points: TimelinePoint[]; current: TimelinePoint; axis: string; select: (id: string) => void;
}) {
  const data = points.flatMap((point, index) => {
    const score = axis ? point.axes[axis] : point.score;
    return score == null ? [] : [{point, score, index}];
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = scrollRef.current;
    const marker = viewport?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!viewport || !marker) return;
    const pointBounds = marker.getBoundingClientRect();
    const bounds = viewport.getBoundingClientRect();
    if (pointBounds.right > bounds.right) viewport.scrollLeft += pointBounds.right - bounds.right + 8;
    else if (pointBounds.left < bounds.left) viewport.scrollLeft += pointBounds.left - bounds.left - 8;
  }, [current.id, points.length, axis]);
  if (!data.length) return <p>Aucune mesure enregistrée pour ce critère.</p>;
  const x = (index: number) => points.length === 1 ? 50 : 100 * index / (points.length - 1);
  const selected = data.find(d => d.point.id === current.id);
  return <figure className="lab-trend" aria-label="Évolution des notes par campagne">
    <figcaption>{axis || 'Indice de la campagne'} <span>/ 100</span></figcaption>
    <div className="trend-layout"><div className="trend-scale" aria-hidden="true">
      {[100,75,50,25,0].map(t => <span key={t} style={{top:(100-t)+'%'}}>{t}</span>)}
    </div><div className="trend-scroll" ref={scrollRef}><div className="trend-canvas" style={{minWidth:points.length * 92}}>
      <div className="trend-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[0,25,50,75,100].map(t => <line key={t} className="trend-grid" x1="0" x2="100" y1={t} y2={t}/>)}
          {data.slice(1).map(({point,score,index},i) => {
            const previous = data[i]!;
            if (index !== previous.index + 1) return null;
            return <line key={point.id} className="trend-segment" strokeDasharray={comparable(previous.point,point) ? undefined : '7 5'}
              x1={x(previous.index)} x2={x(index)} y1={100-previous.score} y2={100-score}/>;
          })}
        </svg>
        {data.map(({point,score,index}) => <button key={point.id} type="button" className="trend-point"
          style={{left:x(index)+'%',top:(100-score)+'%'}} data-full={complete(point)}
          aria-pressed={point.id === current.id} onClick={() => select(point.id)}
          aria-label={date(point.date)+' · '+point.label+' · '+format(score)+'/100'}>
          <span aria-hidden="true"/>{point.id === current.id && <b aria-hidden="true">{format(score)}</b>}
        </button>)}
        {points.map((point,index) => <time key={point.id} className="trend-tick" dateTime={point.date} style={{left:x(index)+'%'}}>
          {new Date(point.date).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})}
          <small>{new Date(point.date).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</small>
        </time>)}
      </div>
    </div></div></div>
    <div className="lab-date-axis">Campagnes par ordre chronologique</div>
    <div className="trend-key"><span>━ Même périmètre</span><span>┄ Périmètre différent ou inconnu</span>
      <span>● Complète　○ Partielle</span></div>
    <div className="trend-selection" aria-live="polite">{selected && <>
      <strong>{format(selected.score)} / 100</strong><div><b>{current.label}</b><br/>{date(current.date)} · {current.protocolLabel} · {coverage(current)}</div>
    </>}</div>
  </figure>;
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
        {current && <ScoreChart select={setSelected} current={current} points={[...filtered].reverse()} axis={axis}/>}
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
