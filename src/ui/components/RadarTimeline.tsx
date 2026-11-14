import { useState, type ReactNode } from 'react';
import type { TimelinePoint } from '../../domain/radarTimeline.ts';

const format = (n: number | null) => n == null ? '—' : n.toLocaleString('fr-FR');
const date = (s: string) => new Date(s).toLocaleString('fr-FR', {dateStyle: 'short', timeStyle: 'short'});
const caption = (p: TimelinePoint) => date(p.date) + ' · ' + p.label + ' · ' + format(p.score) + '/100';

export function RadarTimeline({ points, children, selectMethod }: { points: TimelinePoint[]; children: ReactNode; selectMethod: (point: TimelinePoint) => void }) {
  const [selected, setSelected] = useState('');
  const [reference, setReference] = useState('');
  const sorted = [...points].sort((a,b) => b.date.localeCompare(a.date));
  const current = sorted.find(p => p.id === selected) ?? sorted[0];
  const others = sorted.filter(p => p !== current);
  const before = others.find(p => p.id === reference) ?? others[0];
  const chronological = [...sorted].reverse();
  const start = Date.parse(chronological[0]?.date ?? '');
  const span = Date.parse(current ? sorted[0]!.date : '') - start;
  const x = (p: TimelinePoint) => span > 0 ? 12 + 276 * (Date.parse(p.date) - start) / span : 150;
  const y = (score: number) => 88 - score * .76;
  const global = (p: TimelinePoint) => p.score != null && Object.values(p.axes).every(v => v !== null);
  const options = (items: TimelinePoint[]) => items.map(p => <option key={p.id} value={p.id}>{caption(p)}</option>);
  return <details className="radar-timeline">
    <summary>Évolution des notes et méthodes</summary>
    {children}
    {!current ? <p>Aucun essai enregistré pour ce modèle.</p> : <>
      {chronological.length > 1 && <svg viewBox="0 0 300 100" role="img" aria-label="Évolution de l’indice global dans le temps, sur 100">
        <path d="M12 12V88H288" fill="none" stroke="currentColor" opacity=".25" />
        {chronological.map((p, i) => {
          const prev = chronological[i - 1];
          if (p.score == null) return null;
          return <g key={p.id}>
            {prev && global(prev) && global(p) && <line x1={x(prev)} y1={y(prev.score!)} x2={x(p)} y2={y(p.score)} stroke="currentColor" />}
            <circle cx={x(p)} cy={y(p.score)} r={p === current ? 4 : 3} stroke="currentColor" fill={global(p) ? 'currentColor' : 'var(--ds-color-surface)'}><title>{caption(p)}</title></circle>
          </g>;
        })}
      </svg>}
      <ol aria-label="Chronologie des indices sur 100">{chronological.map(p => {
        const axes = Object.values(p.axes);
        const measured = axes.filter(v => v !== null).length;
        return <li key={p.id}><button type="button" aria-pressed={current.id === p.id} onClick={() => setSelected(p.id)}>
          <time dateTime={p.date}>{date(p.date)}</time>
          <strong>{format(p.score)} / 100</strong>
          <meter min="0" max="100" value={p.score ?? 0} hidden={p.score == null} />
          <span>{p.label}</span><small>{measured === axes.length ? 'Indice global' : 'Partiel · ' + measured + '/' + axes.length + ' axes'}</small>
        </button></li>;
      })}</ol>
      <label>Essai sélectionné<select value={current.id} onChange={e => setSelected(e.target.value)}>{options(sorted)}</select></label>
      <p>{current.reconstructed ? 'Indice reconstitué depuis les archives' : 'Indice enregistré'} · Révision {current.revision?.slice(0, 8) ?? 'inconnue'}</p>
      <p>{current.prompts.join(' · ') || 'Référence du prompt inconnue'}</p>
      {current.instructions && <details><summary>Lire les consignes de cette méthode</summary>{current.instructions.map((text,i) => <p key={i}>{text}</p>)}</details>}
      {(current.scienceMethod || current.biologyMethod) && <button type="button" onClick={() => selectMethod(current)}>Choisir cette méthode pour le prochain essai</button>}
      {before && <label>Comparer avec<select value={before.id} onChange={e => setReference(e.target.value)}>{options(others)}</select></label>}
      <table><thead><tr><th>Axe</th><th>Essai sélectionné</th>{before && <th>Comparaison</th>}</tr></thead>
        <tbody>{Object.entries(current.axes).map(([label, value]) => <tr key={label}><th>{label}</th><td>{format(value)}</td>{before && <td>{format(before.axes[label] ?? null)}</td>}</tr>)}</tbody>
      </table>
    </>}
  </details>;
}
