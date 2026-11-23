import type { BiologyRadarCandidate, BiologyRadarObservation } from '../../domain/biologyTeacherRadar.ts';
import { biologyReadingMetrics, compareBiologyReaders } from '../../domain/biologyReaderComparison.ts';

export function BiologyReaderComparison({ history, readers }: {
  history: readonly BiologyRadarObservation[]; readers: BiologyRadarCandidate[];
}) {
  const [first, ...others] = readers;
  if (!first || !others.length) return null;
  return <details><summary>Comparer les décisions sur les mêmes copies</summary>
    <p>Dernier passage de chaque profil par copie et numéro de répétition. Une décision manquante reste incluse dans le total.</p>
    {others.map(second => {
      const result = compareBiologyReaders(history,first,second);
      const differences = result.rows.filter(r => r.first !== r.expected || r.second !== r.expected);
      return <section key={second.id}><h4>{first.name} / {second.name}</h4>
        <p>{result.rows.length} décisions appariées · {result.excluded} passage(s) écarté(s).</p>
        {!!result.rows.length && <><div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table">
          <thead><tr><th>Profil</th><th>Conformes</th><th>Erronées</th><th>Sans décision</th><th>Écart moyen absolu /10</th><th>Durée moyenne</th></tr></thead>
          <tbody>{(['first','second'] as const).map(side => {
            const m = biologyReadingMetrics(result,side);
            const candidate = side === 'first' ? first : second;
            return <tr key={side}><th scope="row">{candidate.profileId} · {candidate.method}</th><td>{m.correct}</td>
              <td>{m.wrong}</td><td>{m.missing}</td><td>{m.error?.toFixed(2) ?? '—'} ({m.grades} notes)</td>
              <td>{m.seconds === null ? '—' : m.seconds.toFixed(1) + ' s'} ({m.timed} mesures)</td></tr>;
          })}</tbody></table></div>
          <details><summary>Voir les écarts avec la référence ({differences.length})</summary>
            <ul>{differences.map(r => <li key={JSON.stringify([r.caseId,r.repetition,r.id])}>
              Copie {r.caseId}{r.repetition !== undefined && ' · passage ' + r.repetition} · {r.id} · attendu {r.expected}
              {' · '}{first.profileId} {r.first ?? 'sans décision'} · {second.profileId} {r.second ?? 'sans décision'}
            </li>)}</ul></details></>}
      </section>;
    })}
  </details>;
}
