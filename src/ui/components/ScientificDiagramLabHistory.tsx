import { useEffect, useMemo, useState } from 'react';
import type { DiagramLabArchiveRepository } from '../../ports/diagramLabArchiveRepository.ts';
import { compareDiagramLabEntries, diagramLabProtocolLabels, type DiagramLabArchiveEntry, type DiagramLabProtocol } from '../../domain/diagramLabHistory.ts';
import { diagramMethodLabels } from '../../domain/scientificDiagramProtocol.ts';
import { BlindGraphRunDetails } from './BlindGraphRunDetails.tsx';
import { DesignSystemSelect } from './DesignSystemSelect.tsx';
import { Button } from '../design-system/index.ts';
import { downloadScientificDiagramJson } from './ScientificDiagramProtocolPanel.tsx';
import './ScientificDiagramLabHistory.css';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function percent(value: number, total: number) {
  return total ? Math.round(value * 1000 / total) / 10 + ' %' : 'Non mesuré';
}

function ReportDetails({ entry }: { entry: DiagramLabArchiveEntry }) {
  const report = entry.report;
  const [activeCase, setActiveCase] = useState('');
  if ('statistics' in report) return <div className="diagram-lab-reading">
    <h3>Résultats par configuration</h3>
    <div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table">
      <thead><tr><th>Configuration</th><th>Méthode</th><th>Erreurs détectées</th><th>Mesures impossibles</th><th>Bonnes relations rejetées</th><th>Bonnes relations incertaines</th><th>Faux positifs témoins</th><th>Abstentions</th></tr></thead>
      <tbody>{report.statistics.map((stat) => <tr key={stat.profileId + stat.method + stat.promptMode}>
        <th scope="row">{stat.profileId}</th><td>{stat.method}{stat.promptMode !== 'standard' ? ' · ' + stat.promptMode : ''}</td>
        <td><strong>{stat.sensitivityHits}/{stat.sensitivityTrials}</strong> · {percent(stat.sensitivityHits, stat.sensitivityTrials)}</td>
        <td>{stat.sensitivityUnknown}</td>
        <td>{stat.correctRelationRejections}/{stat.correctRelationCount}</td>
        <td>{stat.correctRelationAbstentions}/{stat.correctRelationCount}</td>
        <td>{stat.falsePositiveCount}/{stat.controlObservations}</td>
        <td>{stat.abstentions}/{stat.readingsCount}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="diagram-lab-interpretation">Les dénominateurs comptent uniquement les observations mesurables. Une relation indécidable n’est ni une erreur prouvée ni une réponse correcte. Les rejets de relations correctes sont comptés sur tous les dessins, y compris les variantes modifiées.</p>
    <h3>Examiner les six dessins</h3>
    <div className="diagram-lab-case-chooser" role="group" aria-label="Choisir un cas à inspecter">
      {report.cases.map((item) => <button key={item.caseId + ('promptMode' in item ? item.promptMode : '')}
        type="button" aria-pressed={(activeCase || report.cases[0]?.caseId) === item.caseId}
        onClick={() => setActiveCase(item.caseId)}>{item.caseId}{'promptMode' in item ? ' · ' + item.promptMode : ''}</button>)}
    </div>
    {report.cases.filter((item) => item.caseId === (activeCase || report.cases[0]?.caseId)).map((item, index) =>
      <section key={item.caseId + index} className="diagram-lab-case-detail">
        <h4>{item.caseId} · {item.label}</h4>
        <p>{item.mutation || 'Cas témoin'} · {item.experiments.length} passage(s)</p>
        {report.format === 'companion-scientific-diagram-blind-graph-report' && report.cases.filter((c) => c.caseId === item.caseId).flatMap((c) => c.experiments.map((run, i) =>
          <BlindGraphRunDetails key={i} run={run} gold={c.gold} />))}
        {report.format === 'companion-scientific-diagram-sensitivity-report' && report.cases.filter((c) => c.caseId === item.caseId).flatMap((c) => c.experiments.map((run, i) =>
          <details key={i}><summary>{run.profileName} · {run.method} · passage {run.repetition} · {run.status}</summary>
            <div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table">
              <thead><tr><th>Relation contrôlée</th><th>Référence</th><th>Décision</th></tr></thead>
              <tbody>{run.observations.map((observation) => <tr key={observation.key}>
                <th scope="row">{observation.key}</th><td>{c.gold[observation.key] ?? 'Indécidable'}</td><td>{observation.choice}</td>
              </tr>)}</tbody>
            </table></div>
          </details>))}
      </section>)}
    <p className="diagram-lab-interpretation">{report.limitations}</p>
  </div>;

  if (report.format === 'companion-scientific-diagram-fixture-report') return <div className="diagram-lab-reading">
    <h3>Résultats par schéma et configuration</h3>
    <div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table">
      <thead><tr><th>Schéma</th><th>Configuration</th><th>Méthode</th><th>Référence</th><th>Précision</th><th>Décisions</th><th>Stabilité</th><th>Temps moyen</th></tr></thead>
      <tbody>{report.cases.flatMap((item) => item.summaries.map((summary) => <tr key={item.caseId + summary.profileId + summary.method}>
        <th scope="row">{item.caseId} · {item.label}</th><td>{summary.profileName}</td><td>{diagramMethodLabels[summary.method]}</td>
        <td>{item.referenceScore}/10</td>
        <td>{summary.accuracyPercent === null ? 'Non mesurée' : summary.accuracyPercent + ' %'}</td>
        <td>{summary.resolvedDecisions}/{summary.totalDecisions}</td>
        <td>{summary.stableResolvedTargets === null ? 'Non mesurée' : summary.stableResolvedTargets + '/' + summary.totalTargets}</td>
        <td>{summary.meanDurationMs === null ? '—' : (summary.meanDurationMs / 1000).toFixed(1) + ' s'}</td>
      </tr>))}</tbody>
    </table></div>
    <h3>Décisions par dessin</h3>
    <div className="diagram-lab-case-chooser" role="group" aria-label="Choisir un dessin à inspecter">
      {report.cases.filter((item) => item.experiments.length).map((item) =>
        <button key={item.caseId} type="button"
          aria-pressed={(activeCase || report.cases.find((c) => c.experiments.length)?.caseId) === item.caseId}
          onClick={() => setActiveCase(item.caseId)}>{item.caseId}</button>)}
    </div>
    {report.cases.filter((item) => item.caseId === (activeCase || report.cases.find((c) => c.experiments.length)?.caseId))
      .map((item) => <section key={item.caseId} className="diagram-lab-case-detail">
        <h4>{item.label} · note attendue {item.referenceScore}/10</h4>
        {item.summaries.map((summary) => <div key={summary.profileId + summary.method}>
          <h5>{summary.profileName} · {diagramMethodLabels[summary.method]}</h5>
          <div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table">
            <thead><tr><th>Attendu visuel</th><th>Référence</th><th>Décisions observées</th></tr></thead>
            <tbody>{summary.decisions.map((decision) => <tr key={decision.key}>
              <th scope="row">{decision.key}</th><td>{decision.reference ?? 'Non renseignée'}</td>
              <td>{decision.choices.join(' · ') || 'Aucune décision'}</td>
            </tr>)}</tbody>
          </table></div>
        </div>)}
      </section>)}
    <p className="diagram-lab-interpretation">{report.limitations}</p>
  </div>;

  return <div className="diagram-lab-reading">
    <h3>Résultats de l’essai libre</h3>
    <div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table">
      <thead><tr><th>Configuration</th><th>Méthode</th><th>Justesse</th><th>Couverture</th><th>Temps moyen</th></tr></thead>
      <tbody>{report.summaries.map((summary) => <tr key={summary.profileId + summary.method}>
        <th scope="row">{summary.profileName}</th><td>{diagramMethodLabels[summary.method]}</td>
        <td>{summary.accuracyPercent === null ? 'Non mesurée' : summary.accuracyPercent + ' %'}</td>
        <td>{summary.coveragePercent === null ? 'Non mesurée' : summary.coveragePercent + ' %'}</td>
        <td>{summary.meanDurationMs === null ? '—' : (summary.meanDurationMs / 1000).toFixed(1) + ' s'}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="diagram-lab-interpretation">{report.limitations}</p>
  </div>;
}

export function ScientificDiagramLabHistory({ revision, archiveError, repository }: { revision: number; archiveError?: string; repository: DiagramLabArchiveRepository }) {
  const [entries, setEntries] = useState<DiagramLabArchiveEntry[]>([]);
  const [loadingError, setLoadingError] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<DiagramLabProtocol | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    void repository.list().then((items) => {
      if (!active) return;
      setEntries(items);
      setLoadingError('');
    }).catch((cause) => {
      if (active) setLoadingError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [revision, reload, repository]);
  const visible = useMemo(() => entries.filter((entry) =>
    (protocolFilter === 'all' || entry.protocol === protocolFilter) &&
    (entry.title + ' ' + entry.profiles.join(' ')).toLocaleLowerCase('fr-FR').includes(search.toLocaleLowerCase('fr-FR'))), [entries, protocolFilter, search]);
  const selected = entries.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  const comparison = entries.find((item) => item.id === comparisonId) ?? null;
  const comparisonIssue = selected && comparison ? compareDiagramLabEntries(selected, comparison) : null;

  return <section className="diagram-lab-history" aria-label="Carnet des résultats scientifiques">
    <div className="diagram-lab-history-heading">
      <div><p className="eyebrow">LABORATOIRE · ARCHIVES LOCALES</p><h2>Carnet des résultats</h2>
        <p>Retrouvez les mesures par date, modèle et protocole, même après fermeture de l’application. Les essais en cours sont également conservés au fil de l’exécution.</p></div>
      <Button variant="secondary" onClick={() => setReload((value) => value + 1)}>Actualiser</Button>
    </div>
    {(archiveError || loadingError) && <p role="alert" className="diagram-lab-history-warning">
      Sauvegarde locale indisponible : {archiveError || loadingError}. Exportez vos JSON pour conserver les résultats.
    </p>}
    <div className="diagram-lab-history-filters">
      <label>Protocole
        <DesignSystemSelect value={protocolFilter} onChange={(event) => { setProtocolFilter(event.currentTarget.value as DiagramLabProtocol | 'all'); setSelectedId(null); }}>
          <option value="all">Tous les protocoles</option>
          {(Object.entries(diagramLabProtocolLabels) as Array<[DiagramLabProtocol, string]>).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </DesignSystemSelect>
      </label>
      <label>Rechercher un modèle ou un test
        <input type="search" value={search} onChange={(event) => { setSearch(event.currentTarget.value); setSelectedId(null); }} placeholder="Ex. qwen, graphe, flèches…" />
      </label>
      <span>{visible.length} campagne(s) conservée(s)</span>
    </div>
    {visible.length === 0 ? <p className="diagram-lab-history-empty">Aucun résultat pour ce filtre. Lancez un protocole automatique : ses passages seront conservés ici, sans export préalable.</p> :
      <div className="diagram-lab-history-grid">
        <div className="diagram-lab-history-list" role="group" aria-label="Campagnes enregistrées">
          {visible.map((entry) => <button key={entry.id} type="button" aria-pressed={selected?.id === entry.id}
            className="diagram-lab-history-item" onClick={() => { setSelectedId(entry.id); setComparisonId(null); }}>
            <strong>{entry.title}</strong><small>{formatDate(entry.createdAt)} · {entry.state === 'running' ? 'En cours' : 'Dernier état conservé'}</small>
            <span>{entry.profiles.join(' · ') || 'Aucun profil terminé'}</span>
            <small>{entry.successfulCount}/{entry.experimentCount} passages exploitables · {entry.plannedRepetitions} répétition(s) prévues</small>
          </button>)}
        </div>
        {selected && <article className="diagram-lab-history-detail" key={selected.id}>
          <div className="diagram-lab-history-detail-head">
            <div><p className="eyebrow">RAPPORT ENREGISTRÉ</p><h3>{selected.title}</h3>
              <p>{formatDate(selected.createdAt)} · {selected.localOnly ? 'Exécution locale' : 'Fournisseur distant sélectionné'} · {selected.state === 'running' ? 'En cours' : 'Dernier état sauvegardé'}</p></div>
            <Button variant="secondary" onClick={() => downloadScientificDiagramJson(selected.report, 'companion-laboratoire-' + selected.createdAt.slice(0, 10) + '.json')}>Exporter JSON</Button>
          </div>
          <div className="diagram-lab-kpis">
            <div><strong>{selected.experimentCount}</strong><span>Passages</span></div>
            <div><strong>{selected.successfulCount}</strong><span>Réponses valides</span></div>
            <div><strong>{selected.plannedRepetitions}</strong><span>Répétitions prévues</span></div>
            <div><strong>{selected.profiles.length}</strong><span>Configurations</span></div>
          </div>
          <section className="diagram-lab-compare">
            <label>Comparer à un ancien essai
              <DesignSystemSelect value={comparisonId ?? ''} onChange={(event) => setComparisonId(event.currentTarget.value || null)}>
                <option value="">Aucune comparaison</option>
                {entries.filter((entry) => entry.id !== selected.id && entry.protocol === selected.protocol && entry.report.format === selected.report.format)
                  .map((entry) => <option key={entry.id} value={entry.id}>{formatDate(entry.createdAt)} · {entry.profiles.join(', ')}</option>)}
              </DesignSystemSelect>
            </label>
            {comparisonIssue && <p role="status">{comparisonIssue}</p>}
            {comparison && !comparisonIssue && <div className="diagram-lab-comparison">
              <h4>Deux campagnes du même protocole</h4>
              <div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table">
                <thead><tr><th>Indicateur</th><th>{formatDate(selected.createdAt)}</th><th>{formatDate(comparison.createdAt)}</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Configurations</th><td>{selected.profiles.join(', ')}</td><td>{comparison.profiles.join(', ')}</td></tr>
                  <tr><th scope="row">Passages valides</th><td>{selected.successfulCount}/{selected.experimentCount}</td><td>{comparison.successfulCount}/{comparison.experimentCount}</td></tr>
                  <tr><th scope="row">Nombre de répétitions prévues</th><td>{selected.plannedRepetitions}</td><td>{comparison.plannedRepetitions}</td></tr>
                </tbody>
              </table></div>
              <p>Pour interpréter les évolutions, vérifiez également les mêmes cas, modèles et variantes de consigne dans les détails de chaque rapport.</p>
            </div>}
          </section>
          <ReportDetails key={selected.id + ':' + selected.report.format} entry={selected} />
        </article>}
      </div>}
  </section>;
}
