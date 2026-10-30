import { useMemo, useState } from 'react';
import { buildObservabilityModelMetrics, buildObservabilitySummary, type ObservabilityTrace } from '../domain/observability.ts';
import './observability.css';

type Props = { records: ObservabilityTrace[] };

function duration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded} s`;
  return `${Math.floor(rounded / 60)} min ${String(rounded % 60).padStart(2, '0')} s`;
}

function number(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value);
}

function stageLabel(stage: string): string {
  return stage === 'reading' ? 'Vision · lecture' : stage === 'analysis' ? 'Analyse' : stage === 'arbitration' ? 'Arbitrage' : 'Autre';
}

function TraceDetails({ trace }: { trace: ObservabilityTrace }) {
  const spans = trace.diagnosticRuns ?? [];
  return <details className="observability-trace-details">
    <summary>
      <span className="observability-trace-date">{new Date(trace.completedAt).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
      <span className="observability-trace-models"><strong>{trace.source === 'model-evaluation' ? `Évaluation · ${trace.evaluationProfileName ?? 'Profil'}` : trace.visionModel || 'Vision non renseigné'}</strong><small>{trace.source === 'model-evaluation' ? `${trace.visionModel || 'Sans Vision'} · ${trace.analysisModel || 'Sans Analyse'}` : trace.analysisModel || 'Analyse non renseignée'}</small></span>
      <span className="observability-trace-duration">{duration(trace.totalSeconds)}</span>
      <span className={trace.outcome === 'success' ? 'observability-status success' : 'observability-status error'}>{trace.outcome === 'success' ? 'Terminée' : 'Échec'}</span>
      <span className="observability-expand" aria-hidden="true">⌄</span>
    </summary>
    <div className="observability-trace-body">
      <div className="observability-trace-meta">
        <span><small>Type d’exécution</small><strong>{trace.source === 'model-evaluation' ? `Évaluation de modèles · ${trace.evaluationProfileName ?? 'Profil'}` : 'Correction'}</strong></span>
        <span><small>Devoir</small><strong>{trace.assignmentTitle || 'Devoir sans titre'}</strong></span>
        <span><small>Pages traitées</small><strong>{trace.pageCount}</strong></span>
        <span><small>Lecture / Vision</small><strong>{duration(trace.readingSeconds)}</strong></span>
        <span><small>Analyse</small><strong>{duration(trace.analysisSeconds)}</strong></span>
        <span><small>Note proposée</small><strong>{trace.modelScore === null ? 'Non disponible' : `${number(trace.modelScore)} pts`}</strong></span>
      </div>
      <div className="observability-span-heading"><div><span className="observability-eyebrow">DÉROULÉ TECHNIQUE</span><h4>Étapes de cette trace</h4></div><span>{spans.length} appel(s) détaillé(s)</span></div>
      {spans.length ? <ol className="observability-span-list">{spans.map((span, index) => {
        const stage = span.stage ?? (span.kind === 'vision' ? 'reading' : span.kind === 'arbitrator' ? 'arbitration' : span.kind === 'model' ? 'analysis' : 'other');
        const measured = span.promptTokens !== undefined || span.generatedTokens !== undefined || span.totalTokens !== undefined;
        const tokens = span.totalTokens ?? ((span.promptTokens ?? 0) + (span.generatedTokens ?? 0));
        return <li key={`${span.model}-${stage}-${index}`}>
          <span className="observability-span-marker">{String(index + 1).padStart(2, '0')}</span>
          <div className="observability-span-copy"><strong>{stageLabel(stage)}</strong><small>{span.model}</small></div>
          <div className="observability-span-measure"><strong>{duration(span.elapsedMs / 1000)}</strong><small>{measured ? `${number(tokens)} tokens` : 'Tokens non remontés'}</small></div>
          {(span.requestPrompt !== undefined || span.raw !== undefined) && <details className="observability-call-details">
            <summary>Requête & réponse</summary>
            <div className="observability-call-section"><strong>Requête envoyée au modèle</strong>
              {span.requestMetadata && <dl className="observability-request-metadata">
                <div><dt>Mode</dt><dd>{span.requestMetadata.stream ? 'Streaming' : 'Sans streaming'}</dd></div>
                <div><dt>Thinking</dt><dd>{span.requestMetadata.think ? 'Activé' : 'Désactivé'}</dd></div>
                <div><dt>Format</dt><dd>{span.requestMetadata.format ?? 'Texte libre'}</dd></div>
                <div><dt>Images jointes</dt><dd>{span.requestMetadata.imageCount}</dd></div>
                <div><dt>Keep alive</dt><dd>{String(span.requestMetadata.keepAlive)}</dd></div>
                {span.requestMetadata.temperature !== undefined && <div><dt>Température</dt><dd>{span.requestMetadata.temperature}</dd></div>}
              </dl>}
              <pre>{span.requestPrompt ?? 'Prompt non conservé pour cette ancienne trace.'}</pre>
            </div>
            <div className="observability-call-section"><strong>Réponse brute du modèle</strong><pre>{span.raw ?? 'Réponse non conservée pour cette ancienne trace.'}</pre></div>
            <p className="observability-call-warning">Ces contenus peuvent inclure la consigne, le barème et la transcription de la copie. Ils restent dans le stockage local du navigateur. Les octets des images ne sont pas affichés.</p>
          </details>}
        </li>;
      })}</ol> : <p className="observability-empty-inline">Les anciennes traces ne contiennent pas encore le détail des appels par modèle. Les durées des deux étapes restent disponibles.</p>}
      <p className="observability-privacy-note"><span aria-hidden="true">⌂</span> Les détails textuels des échanges LLM sont accessibles à la demande ; les octets des images ne sont jamais exposés.</p>
    </div>
  </details>;
}

export function ObservabilityDashboard({ records }: Props) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'success' | 'error'>('all');
  const summary = useMemo(() => buildObservabilitySummary(records), [records]);
  const modelMetrics = useMemo(() => buildObservabilityModelMetrics(records), [records]);
  const filteredRecords = useMemo(() => records.filter((record) => {
    const matchesStatus = status === 'all' || record.outcome === status;
    const haystack = `${record.visionModel} ${record.analysisModel} ${record.assignmentTitle ?? ''}`.toLocaleLowerCase('fr-FR');
    return matchesStatus && haystack.includes(query.trim().toLocaleLowerCase('fr-FR'));
  }), [records, query, status]);
  const recent = [...records].sort((left, right) => left.completedAt.localeCompare(right.completedAt)).slice(-10);
  const maxDuration = Math.max(1, ...recent.map((record) => record.totalSeconds));
  const averageVision = summary.averageReadingSeconds;
  const averageAnalysis = summary.averageAnalysisSeconds;
  const maxStage = Math.max(1, averageVision ?? 0, averageAnalysis ?? 0);

  return <section className="observability-workspace" aria-labelledby="observability-title">
    <header className="observability-page-heading">
      <div><p className="observability-eyebrow">PILOTAGE LOCAL · OLLAMA</p><h1 id="observability-title">Observabilité</h1><p>Comprenez les performances et la fiabilité de votre chaîne de correction, sans exposer les copies.</p></div>
      <div className="observability-local-badge"><span></span>Données conservées sur cet appareil</div>
    </header>

    <section className="observability-intro" aria-label="Périmètre des données">
      <div className="observability-intro-icon" aria-hidden="true">⌂</div>
      <div><strong>Vos données pédagogiques restent locales</strong><p>Cette vue exploite l’historique technique déjà enregistré dans le navigateur. Elle n’affiche jamais les photos, les transcriptions ou les réponses brutes des étudiants.</p></div>
      <span>LOCAL</span>
    </section>

    <div className="observability-section-heading"><div><p className="observability-eyebrow">VUE D’ENSEMBLE</p><h2>La santé de votre pipeline IA</h2></div><span className="observability-period">Historique disponible · {summary.traceCount} trace(s)</span></div>

    <div className="observability-kpis">
      <article className="observability-kpi"><span className="observability-kpi-icon">↗</span><div><small>Exécutions observées</small><strong>{summary.traceCount}</strong><span>{records.filter((record) => record.source === 'model-evaluation').length} résultat(s) de modèle · {records.filter((record) => record.source !== 'model-evaluation').length} correction(s)</span></div></article>
      <article className="observability-kpi"><span className="observability-kpi-icon">◷</span><div><small>Durée moyenne</small><strong>{duration(summary.averageDurationSeconds)}</strong><span>Lecture + analyse, temps mural</span></div></article>
      <article className="observability-kpi"><span className="observability-kpi-icon">◎</span><div><small>Taux de réussite</small><strong>{summary.successRatePercent === null ? '—' : `${summary.successRatePercent} %`}</strong><span>Sur les traces conservées</span></div></article>
      <article className="observability-kpi"><span className="observability-kpi-icon">◈</span><div><small>Tokens mesurés</small><strong>{summary.totalTokens === null ? '—' : number(summary.totalTokens)}</strong><span>{summary.measuredCalls}/{summary.totalCalls} appels mesurés par Ollama</span></div></article>
    </div>

    <div className="observability-chart-grid">
      <article className="observability-panel observability-activity-panel">
        <div className="observability-panel-heading"><div><p className="observability-eyebrow">PERFORMANCE DANS LE TEMPS</p><h3>Durée des dernières exécutions</h3><p>Corrections et évaluations de modèles, de la plus ancienne à la plus récente.</p></div><span className="observability-chart-legend"><i></i> Durée totale</span></div>
        {recent.length ? <div className="observability-activity-chart" role="img" aria-label="Graphique des durées des dix dernières corrections">
          <div className="observability-chart-y-axis"><span>{duration(maxDuration)}</span><span>0 s</span></div>
          <div className="observability-chart-bars">{recent.map((record, index) => <div className="observability-chart-column" key={record.id} title={`${new Date(record.completedAt).toLocaleString('fr-FR')} · ${duration(record.totalSeconds)}`}>
            <span className={record.outcome === 'success' ? 'observability-chart-bar' : 'observability-chart-bar failed'} style={{ height: `${Math.max(3, record.totalSeconds / maxDuration * 100)}%` }}></span><small>{index + 1}</small>
          </div>)}</div>
        </div> : <div className="observability-chart-empty"><span>◷</span><strong>Les premières traces apparaîtront ici</strong><p>Lancez une correction ou une évaluation de modèles pour alimenter cet historique.</p></div>}
        <div className="observability-chart-footnote"><span>Plus rapide</span><span>Plus récent →</span></div>
      </article>

      <article className="observability-panel observability-stage-panel">
        <div className="observability-panel-heading"><div><p className="observability-eyebrow">RÉPARTITION DU TEMPS</p><h3>Vision vs Analyse</h3><p>Durée moyenne par étape, sur les mesures disponibles.</p></div></div>
        <div className="observability-stage-bars">
          <div className="observability-stage-row"><div><span className="observability-stage-dot vision"></span><strong>Vision · lecture</strong><b>{duration(averageVision)}</b></div><div className="observability-stage-track"><span className="vision" style={{ width: averageVision === null ? '0%' : `${averageVision / maxStage * 100}%` }}></span></div></div>
          <div className="observability-stage-row"><div><span className="observability-stage-dot analysis"></span><strong>Analyse · notation</strong><b>{duration(averageAnalysis)}</b></div><div className="observability-stage-track"><span className="analysis" style={{ width: averageAnalysis === null ? '0%' : `${averageAnalysis / maxStage * 100}%` }}></span></div></div>
        </div>
        <div className="observability-stage-summary"><span>Temps de lecture moyen <strong>{duration(averageVision)}</strong></span><span>Temps d’analyse moyen <strong>{duration(averageAnalysis)}</strong></span></div>
      </article>
    </div>

    <section className="observability-panel observability-model-panel">
      <div className="observability-panel-heading"><div><p className="observability-eyebrow">CONSOMMATION & MODÈLES</p><h3>Quels modèles mobilisent le plus de temps ?</h3><p>Regroupement des appels réellement détaillés. Les tokens absents ne sont pas assimilés à zéro.</p></div><span className="observability-model-count">{summary.modelsObserved} modèle(s)</span></div>
      {modelMetrics.length ? <div className="observability-model-list">{modelMetrics.slice(0, 8).map((metric) => {
        const max = Math.max(1, ...modelMetrics.map((item) => item.elapsedMs));
        return <div className="observability-model-row" key={metric.model + metric.stage}>
          <div className="observability-model-name"><span className={`observability-model-stage ${metric.stage}`}>{metric.stage === 'reading' ? 'V' : metric.stage === 'analysis' ? 'A' : metric.stage === 'arbitration' ? 'R' : '·'}</span><span><strong>{metric.model}</strong><small>{stageLabel(metric.stage)} · {metric.calls} appel(s)</small></span></div>
          <div className="observability-model-bar"><span style={{ width: `${metric.elapsedMs / max * 100}%` }}></span></div>
          <div className="observability-model-value"><strong>{duration(metric.elapsedMs / 1000)}</strong><small>{metric.measuredCalls ? `${number(metric.totalTokens)} tokens` : 'Tokens non mesurés'}</small></div>
        </div>;
      })}</div> : <p className="observability-empty-inline">Les traces historiques ne contiennent pas encore de détail par appel. Les durées globales restent consultables ci-dessus.</p>}
      <div className="observability-model-footnote"><span>{summary.measuredCalls}/{summary.totalCalls} appels avec métriques de tokens</span><span>{summary.scoredTraces} note(s) proposée(s) structurée(s) · pas une mesure de justesse</span></div>
    </section>

    <section className="observability-panel observability-history-panel">
      <div className="observability-panel-heading"><div><p className="observability-eyebrow">EXPLORATEUR DE TRACES</p><h3>Historique des corrections et évaluations</h3><p>Ouvrez une exécution pour examiner son déroulé, ses modèles et ses mesures.</p></div><span className="observability-model-count">{filteredRecords.length} résultat(s)</span></div>
      <div className="observability-filters">
        <label className="observability-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un modèle ou un devoir" aria-label="Rechercher un modèle ou un devoir" /></label>
        <div className="observability-filter-buttons" role="group" aria-label="Filtrer les traces par statut">
          <button type="button" className={status === 'all' ? 'active' : ''} aria-pressed={status === 'all'} onClick={() => setStatus('all')}>Toutes</button>
          <button type="button" className={status === 'success' ? 'active' : ''} aria-pressed={status === 'success'} onClick={() => setStatus('success')}>Terminées</button>
          <button type="button" className={status === 'error' ? 'active' : ''} aria-pressed={status === 'error'} onClick={() => setStatus('error')}>Échecs</button>
        </div>
      </div>
      {filteredRecords.length ? <div className="observability-trace-list">{filteredRecords.map((trace) => <TraceDetails key={trace.id} trace={trace} />)}</div> : <div className="observability-empty-state"><span>⌕</span><strong>Aucune trace ne correspond à votre recherche</strong><p>Modifiez le filtre ou lancez une nouvelle correction / évaluation.</p></div>}
    </section>
    <p className="observability-footnote">Les indicateurs reflètent uniquement les données effectivement remontées par Ollama et conservées localement. Une note proposée n’est pas une mesure de qualité pédagogique sans référence validée par l’enseignant.</p>
  </section>;
}
