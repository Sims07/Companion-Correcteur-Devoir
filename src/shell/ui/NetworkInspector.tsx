import { useEffect, useMemo, useState } from 'react';
import { clearNetworkHistory, getNetworkInspectorStatus, loadNetworkHistory, networkInspectorEvent, type NetworkRequestRecord } from '../../shared/adapters/network/networkInspector.ts';
import '../../shared/ui/networkInspector.css';
import { isOllamaInferenceRequest } from '../../shared/domain/ollamaTimings.ts';
import { extractOllamaThinking } from '../../shared/domain/ollamaThinkingStream.ts';

type Filter = 'all' | 'pending' | 'error' | 'success';

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function formatDuration(value: number | null): string {
  if (value === null) return '—';
  return value < 1_000 ? `${value} ms` : `${(value / 1_000).toFixed(2)} s`;
}

function formatDetail(value: unknown): string {
  if (typeof value !== 'string') return JSON.stringify(value, null, 2);
  if (!value) return 'Aucune donnée';
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

function requestedThinking(requestBody: string): boolean | null {
  try {
    const parsed: unknown = JSON.parse(requestBody);
    if (parsed && typeof parsed === 'object' && 'think' in parsed) {
      const mode = (parsed as { think?: unknown }).think;
      return typeof mode === 'boolean' ? mode : null;
    }
  } catch { /* Older or non-JSON requests have no explicit setting. */ }
  return null;
}

function Detail({ title, value }: { title: string; value: unknown }) {
  return <section className="network-detail-section"><h3>{title}</h3><pre>{formatDetail(value)}</pre></section>;
}

export function NetworkInspector({ initialFilter = 'all' }: { initialFilter?: 'all' | 'error' }) {
  const [records, setRecords] = useState<NetworkRequestRecord[]>(loadNetworkHistory);
  const [selectedId, setSelectedId] = useState<string | null>(records[0]?.id ?? null);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'headers' | 'request' | 'response' | 'thinking'>('headers');
  const [storageStatus, setStorageStatus] = useState(getNetworkInspectorStatus);
  const [clock, setClock] = useState(() => Date.now());

  const hasPendingRequests = records.some((record) => record.state === 'pending');

  useEffect(() => { setFilter(initialFilter); }, [initialFilter]);

  useEffect(() => {
    const refresh = () => { setRecords(loadNetworkHistory()); setStorageStatus(getNetworkInspectorStatus()); };
    window.addEventListener(networkInspectorEvent, refresh);
    if (!hasPendingRequests) return () => window.removeEventListener(networkInspectorEvent, refresh);
    const timer = window.setInterval(() => setClock(Date.now()), 250);
    return () => { window.removeEventListener(networkInspectorEvent, refresh); window.clearInterval(timer); };
  }, [hasPendingRequests]);

  const filtered = useMemo(() => records.filter((record) => {
    const matchesFilter = filter === 'all' || record.state === filter;
    const matchesQuery = `${record.method} ${record.url} ${record.intent} ${record.context} ${record.status ?? ''} ${record.responseBody}`.toLocaleLowerCase('fr-FR').includes(query.trim().toLocaleLowerCase('fr-FR'));
    return matchesFilter && matchesQuery;
  }), [records, filter, query]);
  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0] ?? null;
  const pending = records.filter((record) => record.state === 'pending').length;
  const errors = records.filter((record) => record.state === 'error').length;
  const liveDuration = (record: NetworkRequestRecord) => record.state === 'pending' ? Math.max(0, clock - Date.parse(record.startedAt)) : record.durationMs;
  const waitingForServer = (record: NetworkRequestRecord) => record.state === 'pending' && record.status === null && (liveDuration(record) ?? 0) >= 15_000;
  const visibleDuration = (record: NetworkRequestRecord) => record.state === 'pending' ? liveDuration(record)
    : isOllamaInferenceRequest(record.url) ? record.providerTimings?.totalMs ?? null : record.durationMs;
  const modelDurationLabel = (record: NetworkRequestRecord) => isOllamaInferenceRequest(record.url) && record.state !== 'pending'
    ? record.providerTimings ? 'Temps Ollama' : 'Temps Ollama indisponible' : record.state === 'pending' ? 'En cours' : 'Temps réseau';
  const selectedThinking = selected && isOllamaInferenceRequest(selected.url)
    ? selected.thinkingBody || extractOllamaThinking(selected.responseBody)
    : '';
  const thinkingRequested = selected ? requestedThinking(selected.requestBody) : null;
  const unexplainedGap = selected?.providerTimings && selected.durationMs !== null
    ? selected.durationMs - selected.providerTimings.totalMs : null;

  return <section className="network-inspector" aria-label="Inspecteur réseau">
    <header className="network-inspector-heading">
      <div><p className="eyebrow">OUTILS DE DÉVELOPPEMENT</p><h1>Inspecteur réseau</h1><p>Suivez les requêtes HTTP de l’application en direct et consultez leur historique local.</p></div>
      <div className="network-inspector-actions"><span className="network-local-indicator">● Historique local</span><button type="button" className="secondary-button" onClick={() => { clearNetworkHistory(); setRecords([]); setSelectedId(null); setStorageStatus(getNetworkInspectorStatus()); }}>Effacer l’historique</button></div>
    </header>
    <div className="network-inspector-summary"><span><b>{records.length}</b> requêtes</span><span className={pending > 0 ? 'network-pending-badge' : ''}><b>{pending}</b> requête(s) en cours</span><span><b>{errors}</b> erreurs</span><span><b>{(storageStatus.storageBytes / 1024).toFixed(1)} Ko</b> occupés dans le stockage local</span></div>
    {storageStatus.storageWarning && <p className="network-error" role="alert">{storageStatus.storageWarning}</p>}
    <div className="network-inspector-layout">
      <section className="network-request-list" aria-label="Liste des requêtes">
        <div className="network-request-toolbar"><input aria-label="Rechercher une requête" placeholder="Filtrer par intention, contexte, URL…" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="network-filter-buttons" role="group" aria-label="Filtrer par statut">{(['all','pending','error','success'] as Filter[]).map((item) => <button key={item} type="button" className={filter === item ? 'active' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === 'all' ? 'Toutes' : item === 'pending' ? 'En cours' : item === 'error' ? 'Erreurs' : 'Terminées'}</button>)}</div></div>
        <div className="network-request-table" role="list" aria-label="Requêtes HTTP">
          <div className="network-request-columns" aria-hidden="true"><span>Heure</span><span>Méthode</span><span>URL</span><span>Intention</span><span>HTTP</span><span>Durée modèle / réseau</span></div>
          {filtered.map((record) => <button type="button" role="listitem" key={record.id} className={selected?.id === record.id ? 'network-request-row selected' : 'network-request-row'} onClick={() => setSelectedId(record.id)}>
            <span className="network-request-time" title={new Date(record.startedAt).toLocaleString("fr-FR")}>{formatTime(record.startedAt)}</span><span className="network-method">{record.method}</span><span className="network-url" title={record.url}>{record.url}</span><span className="network-intent" title={record.context ? `${record.intent} · ${record.context}` : record.intent}><strong>{record.intent}</strong>{record.context && <small>{record.context}</small>}</span><span className={`network-state ${record.state}`}>{record.state === 'pending' ? '…' : record.status ?? 'ERR'}</span><span className="network-duration" title={modelDurationLabel(record)}>{formatDuration(visibleDuration(record))}{isOllamaInferenceRequest(record.url) && record.state !== 'pending' && <small>{record.providerTimings ? 'Ollama' : 'Non mesuré'}</small>}{waitingForServer(record) && <small className="network-waiting-hint">En attente du serveur (modèle en cours de chargement ?)</small>}</span>
          </button>)}
          {!filtered.length && <p className="network-empty">Aucune requête. Les prochains appels HTTP apparaîtront ici.</p>}
        </div>
      </section>
      <section className="network-request-details" aria-label="Détail de la requête">
        {selected ? <>
          <div className="network-selected-heading"><div><span className="network-method">{selected.method}</span><strong>{selected.url}</strong></div><span>{formatTime(selected.startedAt)} · {formatDuration(visibleDuration(selected))} · {modelDurationLabel(selected)}</span></div>
          <section className="network-intent-detail" aria-label="Intention de la requête"><h3>Intention</h3><p>{selected.intent || 'Intention non renseignée'}</p>{selected.context && <small>{selected.context}</small>}{waitingForServer(selected) && <p className="network-waiting-hint" role="status">En attente du serveur (modèle en cours de chargement ?)</p>}
             {selected.state === 'pending' && selected.status !== null && <p className="network-stream-hint" role="status">{selectedThinking ? `Thinking reçu : ${selectedThinking.length} caractères` : selected.responseBody ? 'Flux de réponse reçu · traitement en cours' : 'Réponse HTTP reçue · en attente des premiers fragments'}</p>}
            {isOllamaInferenceRequest(selected.url) && selected.state !== 'pending' && <div className="network-native-timing" aria-label="Durées de la requête">
              <p><strong>Temps Ollama : {formatDuration(selected.providerTimings?.totalMs ?? null)}</strong> · Temps navigateur : {formatDuration(selected.durationMs)}</p>
              {selected.providerTimings && <p>Chargement : {formatDuration(selected.providerTimings.loadMs ?? null)} · Prompt : {formatDuration(selected.providerTimings.promptEvaluationMs ?? null)} · Génération : {formatDuration(selected.providerTimings.generationMs ?? null)}</p>}
              {unexplainedGap !== null && unexplainedGap > 60_000 && unexplainedGap > selected.providerTimings!.totalMs * 2 && <p className="network-waiting-hint" role="status">Écart important entre Ollama et le navigateur : veille, attente ou interruption possible. Écart : {formatDuration(unexplainedGap)}.</p>}
            </div>}
            {selected.state === 'error' && selected.error && <p className="network-error" role="alert"><strong>{selected.status === null ? 'Requête interrompue sans réponse HTTP : ' : 'Erreur réseau : '}</strong>{selected.error}</p>}
          </section>
          <nav className="network-detail-tabs" aria-label="Détails réseau">{(['headers','request','response','thinking'] as const).map((item) => <button type="button" key={item} className={tab === item ? 'active' : ''} aria-pressed={tab === item} onClick={() => setTab(item)}>{item === 'headers' ? 'Headers' : item === 'request' ? 'Payload' : item === 'response' ? 'Response' : 'Thinking'}</button>)}</nav>
          {tab === 'headers' && <><Detail title="General" value={{ url: selected.url, method: selected.method, status: selected.status ? `${selected.status} ${selected.statusText}` : 'En attente' }} /><Detail title="Request headers" value={selected.requestHeaders} /><Detail title="Response headers" value={selected.responseHeaders} /></>}
          {tab === 'request' && <Detail title="Request payload" value={selected.requestBody} />}
          {tab === 'response' && <Detail title="Response body" value={selected.responseBody} />}
           {tab === 'thinking' && (selectedThinking
             ? <Detail title="Thinking reçu du modèle" value={selectedThinking} />
             : <p className="network-empty" role="status">{!isOllamaInferenceRequest(selected.url)
               ? 'Le thinking est affiché pour les requêtes Ollama uniquement.'
               : thinkingRequested === false
                 ? 'Thinking désactivé pour cette requête.'
                 : selected.state === 'pending'
                   ? 'Aucun fragment de thinking reçu pour le moment. Le modèle peut encore charger ou ne pas exposer son raisonnement.'
                   : 'Aucun thinking transmis par le modèle pour cette requête. Le modèle peut ne pas exposer son raisonnement.'}</p>)}
        </> : <p className="network-empty">Sélectionnez une requête pour examiner ses détails.</p>}
      </section>
    </div>
    <p className="network-inspector-footnote">Les corps complets sont disponibles pendant la session ; seuls les 4 000 premiers caractères par corps (y compris Thinking) sont conservés dans l’historique. Les clés, tokens et données binaires sont masqués. L’historique est limité aux 100 dernières requêtes.</p>
  </section>;
}
