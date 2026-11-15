import { radarMethodDecision } from '../../domain/radarMethodDecision.ts';
import {
  activeTimelinePoints, biologyMethodLabels, EMPTY_RADAR_EXCLUSIONS, methodIsActive,
  timelineMethodId, timelineMethodIsActive, type RadarMethodDomain, type RadarMethodExclusions,
} from '../../domain/radarMethodExclusions.ts';
import { scienceMethods } from '../../domain/radarTimeline.ts';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TimelinePoint } from '../../domain/radarTimeline.ts';
import { MethodRadarComparison } from './MethodRadarComparison.tsx';
import { MethodRadarGallery } from './MethodRadarGallery.tsx';
import { RadarMethodGuide } from './RadarMethodGuide.tsx';
import { Button } from '../../../shared/ui/design-system/index.ts';

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
            if (index !== previous.index + 1 || point.label !== previous.point.label || !comparable(previous.point, point)) return null;
            return <line key={point.id} className="trend-segment"
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
    <div className="trend-key"><span>━ Même périmètre</span>
      <span>● Complète　○ Partielle</span></div>
    <div className="trend-selection" aria-live="polite">{selected && <>
      <strong>{format(selected.score)} / 100</strong><div><b>{current.label}</b><br/>{date(current.date)} · {current.protocolLabel} · {coverage(current)} · Révision {current.revision?.slice(0,8) ?? 'inconnue'}</div>
    </>}</div>
  </figure>;
}

interface Props {
  points: TimelinePoint[]; model: string; domainLabel: string; children: ReactNode;
  onBack: () => void; onExport: () => void; selectMethod: (p: TimelinePoint) => void;
  domain?: RadarMethodDomain;
  exclusions?: RadarMethodExclusions;
  onToggleMethod?: (id: string) => void;
  methodSelectionDisabled?: boolean;
}

export function RadarTimeline({
  points, model, domainLabel, children, onBack, onExport, selectMethod,
  domain = 'diagrams', exclusions = EMPTY_RADAR_EXCLUSIONS, onToggleMethod,
  methodSelectionDisabled = false,
}:Props) {
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [axis, setAxis] = useState('');
  const sorted = activeTimelinePoints(points, domain, exclusions).sort((a,b) => b.date.localeCompare(a.date));
  const archived = [...points].sort((a,b) => b.date.localeCompare(a.date));
  const methods = [...new Set(sorted.map(p => p.label))];
  const allMethods = [...new Set(archived.map(p => p.label))];
  // The source of truth for observed labels is the same history used by the gallery.
  // Legacy campaigns have no named trial strategy and must still be selectable here.
  const observed = [...new Map(archived.map(point => [
    timelineMethodId(domain, point), { point, id: timelineMethodId(domain, point), label: point.label },
  ]).filter((item): item is [string, {point: TimelinePoint; id: string; label: string}] =>
    typeof item[0] === 'string')).values()];
  const planned = (domain === 'diagrams'
    ? Object.entries(scienceMethods).map(([id, method]) => ({id, label: method.label}))
    : Object.entries(biologyMethodLabels).map(([id, label]) => ({id, label})))
    .filter(method => domain === 'biology' || !observed.some(row => row.id === method.id));
  const activeFilter = filter === '' || (filter && methods.includes(filter))
    ? filter : methods[0] ?? '';
  const filtered = sorted.filter(p => !activeFilter || p.label === activeFilter);
  const decision = radarMethodDecision(sorted);
  const current = filtered.find(p => p.id === selected) ?? filtered[0];
  const axes = [...new Set(sorted.flatMap(p => Object.keys(p.axes)))];
  return <section className="method-lab" aria-label="Laboratoire des méthodes">
    <nav aria-label="Fil d’Ariane"><button type="button" onClick={onBack}>Retour aux radars</button> / {domainLabel}</nav>
    <header><div><h2>Laboratoire des méthodes</h2><p>{model} · {domainLabel}</p></div>
</header>
    <RadarMethodGuide domain={domain}/>

    <section className="lab-method-visibility" aria-label="Méthodes actives et exclues">
      <h3>Inclure ou exclure les méthodes</h3>
      <p>Les noms ci-dessous sont identiques à ceux de « Tous les radars par méthode ».
        Une méthode exclue sort des comparaisons et relances concernées, sans supprimer ses résultats.
        Les exclusions s'appliquent à tous les LLM de ce type de radar.</p>
      {observed.length > 0 && <div className="lab-method-options">{observed.map(method => {
        const active = timelineMethodIsActive(exclusions, domain, method.point);
        const protocol = domain === 'biology' ? method.point.biologyMethod ??
          (method.label.startsWith('Pilote ·') ? 'pilot' : undefined) : undefined;
        const blocked = protocol ? !methodIsActive(exclusions, 'biology', protocol) : false;
        return <label key={method.id} data-excluded={!active}>
          <input type="checkbox" checked={active} disabled={methodSelectionDisabled || !onToggleMethod || blocked}
            onChange={() => onToggleMethod?.(method.id)} aria-label={'Inclure ' + method.label}/>
          <span>{method.label}</span><small>{blocked ? 'Protocole exclu' : active ? 'Active' : 'Exclue'}</small>
        </label>;
      })}</div>}
      {planned.length > 0 && <details className="lab-method-planned">
        <summary>{domain === 'diagrams' ? 'Stratégies sans radar enregistré' : 'Exclusions générales par protocole'}</summary>
        {domain === 'biology' && <p>Ces réglages généraux excluent toutes les variantes du protocole, y compris celles de l'historique.</p>}
        <div className="lab-method-options">{planned.map(method => {
          const active = methodIsActive(exclusions, domain, method.id);
          return <label key={method.id} data-excluded={!active}>
            <input type="checkbox" checked={active} disabled={methodSelectionDisabled || !onToggleMethod}
              onChange={() => onToggleMethod?.(method.id)} aria-label={'Inclure ' + method.label}/>
            <span>{method.label}</span><small>{active ? 'Active' : 'Exclue'}</small>
          </label>;
        })}</div>
      </details>}
    </section>
    {!points.length ? <p>Aucun essai enregistré pour ce modèle.</p> : <>
      {sorted.length ? <>
      <section aria-label="Choix de méthode"><h3>{decision.title}</h3><p>{decision.detail}</p>
        {decision.winner && (decision.winner.scienceMethod || decision.winner.biologyMethod) &&
          <Button variant="secondary" onClick={() => selectMethod(decision.winner!)}>Choisir la recommandation pour le prochain essai</Button>}
        <a href="#method-batteries">Examiner ou compléter les batteries</a></section>
      <section><h3>Évolution des notes</h3>
        <div className="lab-controls"><label>Méthode affichée<select value={activeFilter} onChange={e => setFilter(e.target.value)}>
          <option value="">Toutes les méthodes</option>{methods.map(m => <option key={m}>{m}</option>)}</select></label>
          <label>Mesure affichée<select value={axis} onChange={e => setAxis(e.target.value)}><option value="">Indice de l’essai</option>{axes.map(a => <option key={a}>{a}</option>)}</select></label></div>
        {current && <ScoreChart select={setSelected} current={current} points={[...filtered].reverse()} axis={axis}/>}
      </section>
      <div role="group" aria-label="Affichage des radars">
        <Button variant="secondary" aria-pressed={!overlay} onClick={() => setOverlay(false)}>Côte à côte</Button>
        <Button variant="secondary" aria-pressed={overlay} onClick={() => setOverlay(true)}>Superposer</Button>
      </div>
      <MethodRadarComparison sorted={sorted} axes={axes} gallery={overlay ? undefined : <MethodRadarGallery points={sorted} selectedId={current?.id ?? ''} onSelect={point => {
        setFilter(point.label);
        setSelected(point.id);
      }}/>}/>
      </> : <p role="status">Toutes les méthodes évaluées sont exclues. Réactivez-en une pour retrouver les comparaisons et les tendances.</p>}
      <details><summary>Détail des essais et historique</summary><Button variant="secondary" disabled={!points.length} onClick={onExport}>Exporter l’historique des méthodes</Button><section><h3>Résultats par méthode</h3><div className="lab-scroll"><table><caption>Dernier essai de chaque méthode</caption>
        <thead><tr><th>Méthode utilisée</th><th>Essais</th><th>Dernier test</th><th>Date</th><th>Indice /100</th><th>Couverture</th></tr></thead>
        <tbody>{allMethods.map(m => { const rows = archived.filter(p => p.label === m); const p = rows[0]!;
          const active = timelineMethodIsActive(exclusions, domain, p);
          return <tr key={m} data-excluded={!active}>
            <th scope="row">{active
              ? <button onClick={() => { setFilter(m); setSelected(p.id); }}>{m}</button>
              : <>{m} <small>· Exclue</small></>}</th>
            <td>{rows.length}{!active && <details><summary>Consulter les anciennes mesures</summary><ul>
              {rows.map(row => <li key={row.id}><time dateTime={row.date}>{date(row.date)}</time>
                {' · '}{format(row.score)}/100 · {coverage(row)}
                <ul>{Object.entries(row.axes).map(([axis, value]) =>
                  <li key={axis}>{axis} : {format(value)}/100</li>)}</ul></li>)}
            </ul></details>}</td>
            <td>{p.protocolLabel ?? 'Non renseigné'}</td><td>{date(p.date)}</td>
            <td>{format(p.score)}</td><td>{coverage(p)}</td></tr>;
        })}</tbody></table></div></section>
      {current && <section><h3>Historique des campagnes</h3>
        <label>Essai sélectionné<select value={current.id} onChange={e => setSelected(e.target.value)}>{options(filtered)}</select></label>
        <p>{current.protocolLabel} · {coverage(current)} · {current.reconstructed ? 'Indice reconstitué' : 'Indice enregistré'} · Révision {current.revision?.slice(0,8) ?? 'inconnue'}</p>
        <div className="lab-criteria">{measured(current).map(a => <span key={a}>{a} <strong>{format(current.axes[a])}/100</strong></span>)}</div>
        {current.batteryEngines?.length ? <details open><summary>Moteurs réellement utilisés par batterie</summary>
          <ul>{current.batteryEngines.map((battery, index) =>
            <li key={index}><strong>{battery.protocol}</strong> : {battery.engine}</li>)}</ul>
        </details> : null}
        <details><summary>Prompts et consignes de l’essai sélectionné</summary><p>{current.prompts.join(' · ') || 'Référence inconnue'}</p>{current.instructions?.map((s,i) => <p key={i}>{s}</p>)}</details>
        {(current.scienceMethod || current.biologyMethod) && <Button variant="secondary" onClick={() => selectMethod(current)}>Choisir cette méthode pour le prochain essai</Button>}
      </section>}</details>
    </>}
    <section className="lab-launch" id="method-batteries">{children}</section>
  </section>;
}
