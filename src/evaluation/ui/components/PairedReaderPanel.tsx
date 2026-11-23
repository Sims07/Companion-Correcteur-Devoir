import { useState } from 'react';
import type { DiagramLabArchiveEntry } from '../../domain/diagramLabHistory.ts';
import { availableReaders, pairedDecisions, passageMetrics, summarizeReader } from '../../domain/pairedReaders.ts';
import { compareCampaignRubrics } from '../../domain/diagramRubricComparison.ts';

const strategies = { first: 'Premier lecteur', second: 'Second lecteur', targeted: 'Relecture ciblée simulée' } as const;
const verdicts: Record<string,string> = { present: 'Présent', partial: 'Partiel', absent: 'Absent' };

export function PairedReaderPanel({ entry, entries, names }: {
  entry: DiagramLabArchiveEntry; entries: DiagramLabArchiveEntry[]; names: Record<string,string>;
}) {
  const [otherId, setOtherId] = useState(entry.id);
  const [firstId, setFirstId] = useState('');
  const [secondId, setSecondId] = useState('');
  const left = entry.report;
  const other = entries.find(e => e.id === otherId) ?? entry;
  const right = other.report;
  if (left.format !== 'companion-scientific-diagram-fixture-report' || right.format !== left.format) return null;
  const firstOptions = availableReaders(left);
  const first = firstOptions.find(o => o.id === firstId) ?? firstOptions[0];
  const secondOptions = availableReaders(right).filter(o => entry.id !== other.id || o.id !== first?.id);
  const second = secondOptions.find(o => o.id === secondId) ?? secondOptions[0];
  const paired = first && second && compareCampaignRubrics(entry, other).status === 'same'
    ? pairedDecisions(left, first.id, right, second.id) : null;
  const rows = paired?.rows ?? [];
  const differences = rows.filter(r => r.first.choice !== r.second.choice || r.first.review || r.second.review ||
    r.first.choice !== r.expected);
  return <details className="diagram-lab-compare"><summary>Comparer deux lecteurs sur les mêmes copies</summary>
    <label>Premier lecteur <select aria-label="Premier lecteur" value={first?.id ?? ''} onChange={e => setFirstId(e.target.value)}>
      {firstOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
    <label>Campagne du second lecteur <select aria-label="Campagne du second lecteur" value={other.id} onChange={e => setOtherId(e.target.value)}>
      {entries.filter(e => e.report.format === left.format).map(e => <option key={e.id} value={e.id}>
        {e.profiles.join(', ')} · {e.title} · {new Date(e.createdAt).toLocaleString('fr-FR')}</option>)}</select></label>
    <label>Second lecteur <select aria-label="Second lecteur" value={second?.id ?? ''} onChange={e => setSecondId(e.target.value)}>
      {secondOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
    {!second ? <p>Choisissez une campagne contenant un autre passage ou un deuxième profil.</p>
      : !paired || paired.incompatible ? <p>Les versions du protocole et du barème doivent coïncider.</p>
      : <><p>{rows.length} décisions appariées · {paired.excluded} passage(s) écarté(s).</p>
        {rows.length > 0 && <><p>La simulation consulte le second avis enregistré si le premier lecteur demande une vérification,
          manque de preuve pour sa proposition ou ne produit aucune décision. Un désaccord après ce recours reste à vérifier.</p>
          <div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table"><thead><tr>
            {['Stratégie','Conformes','Erronées','Sans décision','À vérifier','Erreurs sans alerte','Recours au second'].map(h => <th key={h}>{h}</th>)}
          </tr></thead><tbody>{(Object.keys(strategies) as (keyof typeof strategies)[]).map(key => {
            const s = summarizeReader(rows, key);
            return <tr key={key}><th scope="row">{strategies[key]}</th><td>{s.correct}</td><td>{s.wrong}</td>
              <td>{s.missing}</td><td>{s.reviews}</td><td>{s.silentErrors}</td><td>{key === 'targeted' ? s.calls : '—'}</td></tr>;
          })}</tbody></table></div>
          <ul>{(['first','second'] as const).map(side => {
            const m = passageMetrics(paired.passages,side);
            return <li key={side}>{strategies[side]} · écart absolu moyen {m.error?.toFixed(2) ?? '—'} /10 ({m.graded} notes)
              {' · '}durée moyenne {m.seconds === null ? '—' : m.seconds.toFixed(1)+' s'} ({m.timed} mesures)</li>;
          })}</ul>
          <details><summary>Examiner les écarts et les relectures ({differences.length})</summary>
            <div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table">
              <thead><tr><th>Dessin · passage</th><th>Critère</th><th>Référence du jeu</th><th>Premier lecteur</th><th>Second lecteur</th></tr></thead>
              <tbody>{differences.map(r => <tr key={JSON.stringify([r.caseId,r.repetition,r.key])}><td>{r.caseId} · {r.repetition}</td>
                <th scope="row">{names[r.key] ?? r.key}</th><td>{verdicts[r.expected]}</td>
                {[r.first,r.second].map((v,i) => <td key={i}>{v.choice ? verdicts[v.choice] : 'Sans décision'}{v.review && ' · À vérifier'}</td>)}</tr>)}</tbody>
            </table></div></details></>}
      </>}
  </details>;
}
