import { useEffect, useMemo, useRef, useState } from 'react';
import type { DiagramLabArchiveRepository } from '../../ports/diagramLabArchiveRepository.ts';
import { compareDiagramLabEntries, diagramLabProtocolLabels, parseDiagramLabReportJson, summarizeDiagramLabReport, type DiagramLabArchiveEntry, type DiagramLabProtocol } from '../../domain/diagramLabHistory.ts';
import { diagramMethodLabels } from '../../domain/scientificDiagramProtocol.ts';
import { BlindGraphRunDetails } from './BlindGraphRunDetails.tsx';
import { buildDiagramLabComparison } from '../../domain/diagramLabComparison.ts';
import type { RadarMissingTestRequest } from '../../domain/diagramLabRadarLaunch.ts';
import { buildDiagramLabRadar, type RadarModelConfiguration } from '../../domain/diagramLabRadar.ts';
import { summarizeDiagramLabReadiness } from '../../domain/diagramLabReadiness.ts';
import { ScientificDiagramRadar } from './ScientificDiagramRadar.tsx';
import { ZoomableImage } from './ZoomableImage.tsx';
import { assessDiagramDecision, type DiagramDecisionStatus } from '../../domain/diagramDecisionComparison.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC } from '../../domain/scientificDiagramFixtures.ts';
import { scientificDiagramSensitivityPreviewUrl } from '../../domain/scientificDiagramSensitivity.ts';
import cleanDiagramUrl from '../../assets/pilot/scientific-mitosis-10.webp';
import intermediateDiagramUrl from '../../assets/pilot/scientific-mitosis-5.webp';
import poorDiagramUrl from '../../assets/pilot/scientific-mitosis-0.webp';
import correctPointerDiagramUrl from '../../assets/pilot/scientific-mitosis-labels-control.svg';
import swappedPointerDiagramUrl from '../../assets/pilot/scientific-mitosis-labels-swapped.svg';

const fixturePreviews = {
  A: cleanDiagramUrl, B: intermediateDiagramUrl, C: poorDiagramUrl,
  D: correctPointerDiagramUrl, E: swappedPointerDiagramUrl,
};
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

const decisionNames = Object.fromEntries(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.flatMap((criterion) =>
  (criterion.subcriteria ?? []).map((sub) => [criterion.id + '::' + sub.id, sub.title])));
const decisionStates: Record<DiagramDecisionStatus, string> = {
  correct: 'Conforme', incorrect: 'Écart', mixed: 'Résultat variable', unmeasured: 'Non mesuré',
};

function readableVisualDecision(value: string) {
  return ({ present: 'Critère respecté', absent: 'Critère non respecté',
    partial: 'Partiellement respecté', uncertain: 'Incertain' } as Record<string, string>)[value] ?? value;
}

export function ReportDetails({ entry }: { entry: DiagramLabArchiveEntry }) {
  const report = entry.report;
  const [activeCase, setActiveCase] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  if (report.format === 'companion-scientific-diagram-sensitivity-report' || report.format === 'companion-scientific-diagram-blind-graph-report') return <div className="diagram-lab-reading">
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
        <div className="diagram-lab-case-image">
          <ZoomableImage src={scientificDiagramSensitivityPreviewUrl(item.caseId)} alt={'Schéma de référence ' + item.caseId} />
          <div><h4>{item.caseId} · {item.label}</h4>
            <p>{item.mutation || 'Cas témoin'} · {item.experiments.length} passage(s)</p></div>
        </div>
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
        <div className="diagram-lab-case-image">
          <ZoomableImage src={fixturePreviews[item.caseId]} alt={'Schéma de référence ' + item.caseId} />
          <h4>{item.label} · note attendue {item.referenceScore}/10</h4>
        </div>
        {item.experiments.some((run) => run.diagnostics?.invalidPoints?.length) && <div className="diagram-protocol-diagnostic">
          <strong>Notes rejetées par le barème</strong>
          <ul>{item.experiments.flatMap((run, index) => (run.diagnostics?.invalidPoints ?? [])
            .map((point) => <li key={index + '-' + point.path}>
              Passage {index + 1} · {point.path} : reçu {String(point.received)}, maximum {point.maximum}
            </li>))}</ul>
        </div>}
        {item.summaries.map((summary) => {
          const statuses = summary.decisions.map((decision) => assessDiagramDecision(decision.reference, decision.choices));
          const correct = statuses.filter((status) => status === 'correct').length;
          const incorrect = statuses.filter((status) => status === 'incorrect').length;
          const unresolved = statuses.filter((status) => status === 'mixed' || status === 'unmeasured').length;
          const visible = summary.decisions.filter((decision) => !onlyIssues ||
            assessDiagramDecision(decision.reference, decision.choices) !== 'correct');
          return <div key={summary.profileId + summary.method}>
            <h5>{summary.profileName} · {diagramMethodLabels[summary.method]}</h5>
            <div className="diagram-lab-decision-overview">
              <p role="status"><strong>{correct}/{summary.decisions.length} critères conformes</strong>
                {' · '}<span>{incorrect} écart(s)</span>
                {unresolved ? ' · ' + unresolved + ' variable(s) ou non mesuré(s)' : ''}
              </p>
              <button type="button" aria-pressed={onlyIssues} onClick={() => setOnlyIssues((current) => !current)}>
                {onlyIssues ? 'Afficher toutes les décisions' : 'Voir uniquement les écarts'}
              </button>
            </div>
            <div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table diagram-lab-decision-table">
              <thead><tr><th>État</th><th>Critère contrôlé</th><th>Référence</th><th>Décisions observées</th></tr></thead>
              <tbody>{visible.map((decision) => {
                const status = assessDiagramDecision(decision.reference, decision.choices);
                const explainAlignment = decision.key === 'legends::legends-aligned' && item.layoutObservation;
                const explainPointers = decision.key === 'legends::legends-visible' && item.labelPointerChallenge;
                return <tr key={decision.key} className={'diagram-lab-decision-row--' + status}>
                  <td><span className={'diagram-lab-decision-status diagram-lab-decision-status--' + status}
                    aria-label={'Statut : ' + decisionStates[status]}>
                    <span aria-hidden="true">{status === 'correct' ? '✓' : status === 'incorrect' ? '✕' : '–'}</span>
                    {' '}{decisionStates[status]}
                  </span></td>
                  <th scope="row">{decisionNames[decision.key] ?? decision.key}
                    <small className="diagram-lab-decision-key">{decision.key}</small>
                    {status !== 'correct' && explainAlignment && <small className="diagram-lab-decision-note">{item.layoutObservation?.reason}</small>}
                    {status !== 'correct' && explainPointers && <small className="diagram-lab-decision-note">
                      {item.labelPointerChallenge?.expected === 'incorrect'
                        ? 'Les légendes sont visibles, mais quatre traits pointent vers une autre structure : '
                        : 'Le témoin possède des flèches correctement orientées : '}
                      {item.labelPointerChallenge?.descriptions.join(' ')}
                    </small>}
                  </th>
                  <td>{decision.reference ? readableVisualDecision(decision.reference) : 'Non renseignée'}</td>
                  <td>{decision.choices.map(readableVisualDecision).join(' · ') || 'Aucune décision'}</td>
                </tr>;
              })}</tbody>
            </table></div>
            {visible.length === 0 && <p className="diagram-lab-interpretation">Aucun écart ni critère non mesuré dans cette configuration.</p>}
          </div>;
        })}
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

export function ScientificDiagramLabHistory({ initialReportId, revision, archiveError, repository, view, onViewChange, profileIds, profiles = [], busy, onRunMissing, onBack }: {
  initialReportId?: string; revision: number; archiveError?: string; repository: DiagramLabArchiveRepository;
  view: 'campaigns' | 'radar'; onViewChange: (view: 'campaigns' | 'radar') => void;
  profileIds: readonly string[]; profiles?: readonly RadarModelConfiguration[]; busy: boolean;
  onRunMissing: (request: Omit<RadarMissingTestRequest, 'id'>) => void;
  onBack?: () => void;
}) {
  const [entries, setEntries] = useState<DiagramLabArchiveEntry[]>([]);
  const [loadingError, setLoadingError] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<DiagramLabProtocol | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialReportId ?? null);
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importNotice, setImportNotice] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  async function importReport(file?: File) {
    if (!file) return;
    setImportBusy(true);
    setImportNotice('');
    try {
      if (file.size > 20_000_000) throw new Error('Rapport trop volumineux (20 Mo maximum).');
      const report = parseDiagramLabReportJson(await file.text());
      const entry = summarizeDiagramLabReport(report, 'finished');
      await repository.save(entry);
      setProtocolFilter('all');
      setSearch('');
      setSelectedId(entry.id);
      setReload((value) => value + 1);
      setImportNotice('Ancien rapport ajouté aux campagnes de test locales.');
    } catch (cause) {
      setImportNotice('Import impossible : ' + (cause instanceof Error ? cause.message : String(cause)));
    } finally {
      setImportBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void repository.list().then((items) => {
      if (!active) return;
      setEntries([...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)));
      setLoadingError('');
    }).catch((cause) => {
      if (active) setLoadingError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => { active = false; };
  }, [revision, reload, repository]);
  const visible = useMemo(() => entries.filter((entry) =>
    (protocolFilter === 'all' || entry.protocol === protocolFilter) &&
    (entry.title + ' ' + entry.profiles.join(' ')).toLocaleLowerCase('fr-FR').includes(search.toLocaleLowerCase('fr-FR'))), [entries, protocolFilter, search]);
  const radarCandidates = useMemo(() => buildDiagramLabRadar(entries, 'profile'), [entries]);
  const readiness = useMemo(() => summarizeDiagramLabReadiness(entries.length, radarCandidates), [entries, radarCandidates]);
  const selected = entries.find((item) => item.id === selectedId) ?? visible[0] ?? null;
  const comparison = entries.find((item) => item.id === comparisonId) ?? null;
  const comparisonIssue = selected && comparison ? compareDiagramLabEntries(selected, comparison) : null;
  const comparisonRows = selected && comparison && !comparisonIssue ? buildDiagramLabComparison(selected, comparison) : [];

  return <section className="diagram-lab-history" aria-label="Campagnes de test scientifiques">
    {view === 'campaigns' && onBack && <div className="diagram-lab-history-back"><Button variant="secondary" onClick={onBack}>← Retour aux campagnes</Button><span>Historique des évaluations / Schémas scientifiques</span></div>}
    {view === 'campaigns' && <div className="diagram-lab-history-heading">
      <div><p className="eyebrow">CAMPAGNES DE TEST · SCHÉMAS SCIENTIFIQUES</p><h2>Campagnes de test</h2>
        <p>Comparez les performances sur neuf caractéristiques ou examinez les preuves de chaque campagne.</p></div>
      <div className="diagram-lab-history-heading-actions">
        <input ref={fileInput} type="file" accept=".json,application/json" hidden
          aria-label="Choisir un ancien rapport JSON"
          onChange={(event) => {
            const chosen = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            void importReport(chosen);
          }} />
        <Button variant="secondary" disabled={importBusy} onClick={() => fileInput.current?.click()}>Importer un ancien JSON</Button>
        <Button variant="secondary" onClick={() => setReload((value) => value + 1)}>Actualiser</Button>
      </div>
    </div>}
    {view === 'campaigns' && importNotice && <p role="status" className="diagram-lab-history-import-feedback">{importNotice}</p>}
    {(archiveError || loadingError) && <p role="alert" className="diagram-lab-history-warning">
      Sauvegarde locale indisponible : {archiveError || loadingError}. Exportez vos JSON pour conserver les résultats.
    </p>}
    {view === 'campaigns' && entries.length > 0 && <section className="diagram-lab-readiness" aria-label="Bilan des batteries scientifiques">
      <div className="diagram-lab-readiness-stat"><strong>{readiness.campaigns}</strong><span>Campagnes conservées</span></div>
      <div className="diagram-lab-readiness-stat"><strong>{readiness.candidates}</strong><span>Candidats évalués</span></div>
      <div className="diagram-lab-readiness-stat"><strong>{readiness.bestMeasuredAxes}/{readiness.totalAxes}</strong><span>Axes du profil le mieux couvert</span></div>
      <div className="diagram-lab-readiness-action">
        <p role="status">{readiness.fullyMeasured >= 2
          ? readiness.fullyMeasured + ' candidats avec neuf axes : comparaison globale possible.'
          : readiness.fullyMeasured === 1
            ? 'Un candidat complet. Évaluez un second candidat pour les comparer.'
            : 'Aucun candidat complet : les axes non testés restent non mesurés.'}</p>
        <Button variant="secondary" onClick={() => onViewChange('radar')}>Voir le radar à neuf axes</Button>
      </div>
    </section>}

    {view === 'radar' && <ScientificDiagramRadar entries={entries} profileIds={profileIds} profiles={profiles} busy={busy} onRunMissing={onRunMissing} onOpenReport={(id) => {
      setSelectedId(id);
      setProtocolFilter('all');
      setSearch('');
      onViewChange('campaigns');
    }} />}
    {view === 'campaigns' && <>
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
              <h4>Mesures comparées par dessin et modèle</h4>
              {comparisonRows.length ? <div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table">
                <thead><tr><th>Dessin / modèle / méthode</th><th>Indicateur</th><th>Essai consulté</th><th>Essai précédent</th></tr></thead>
                <tbody>{comparisonRows.map((row) => <tr key={row.key + row.metric}>
                  <th scope="row">{row.label}</th><td>{row.metric}</td><td>{row.current}</td><td>{row.previous}</td>
                </tr>)}</tbody>
              </table></div> : <p>Pas encore de mesure commune ou exploitable dans ces deux rapports.</p>}
              <p>Les colonnes sont rapprochées lorsque le dessin, la configuration, la méthode et la stratégie coïncident. Une case « — » signifie que l’essai ne comporte pas cette mesure. Les variantes de consignes et les répétitions différentes ne constituent pas une comparaison strictement contrôlée.</p>
            </div>}
          </section>
          <ReportDetails key={selected.id + ':' + selected.report.format} entry={selected} />
        </article>}
      </div>}
    </>}
  </section>;
}
