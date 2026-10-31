import { useEffect, useMemo, useState } from 'react';
import { clearNetworkHistory, getNetworkInspectorStatus, loadNetworkHistory, networkInspectorEvent, type NetworkRequestRecord } from '../adapters/network/networkInspector.ts';
import './networkInspector.css';

type Filter = 'all' | 'pending' | 'error' | 'success';

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('fr-FR', { hour12: false });
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

function Detail({ title, value }: { title: string; value: unknown }) {
  return <section className="network-detail-section"><h3>{title}</h3><pre>{formatDetail(value)}</pre></section>;
}

export function NetworkInspector() {
  const [records, setRecords] = useState<NetworkRequestRecord[]>(loadNetworkHistory);
  const [selectedId, setSelectedId] = useState<string | null>(records[0]?.id ?? null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'headers' | 'request' | 'response'>('headers');
  const [storageStatus, setStorageStatus] = useState(getNetworkInspectorStatus);

  useEffect(() => {
    const refresh = () => { setRecords(loadNetworkHistory()); setStorageStatus(getNetworkInspectorStatus()); };
    window.addEventListener(networkInspectorEvent, refresh);
    return () => window.removeEventListener(networkInspectorEvent, refresh);
  }, []);

  const filtered = useMemo(() => records.filter((record) => {
    const matchesFilter = filter === 'all' || record.state === filter;
    const matchesQuery = `${record.method} ${record.url} ${record.status ?? ''} ${record.responseBody}`.toLocaleLowerCase('fr-FR').includes(query.trim().toLocaleLowerCase('fr-FR'));
    return matchesFilter && matchesQuery;
  }), [records, filter, query]);
  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0] ?? null;
  const pending = records.filter((record) => record.state === 'pending').length;
  const errors = records.filter((record) => record.state === 'error').length;

  return <main className="network-inspector" aria-label="Inspecteur réseau">
    <header className="network-inspector-heading">
      <div><p className="eyebrow">OUTILS DE DÉVELOPPEMENT</p><h1>Inspecteur réseau</h1><p>Suivez les requêtes HTTP de l’application en direct et consultez leur historique local.</p></div>
      <div className="network-inspector-actions"><span className="network-local-indicator">● Historique local</span><button type="button" className="secondary-button" onClick={() => { clearNetworkHistory(); setRecords([]); setSelectedId(null); setStorageStatus(getNetworkInspectorStatus()); }}>Effacer l’historique</button></div>
    </header>
    <div className="network-inspector-summary"><span><b>{records.length}</b> requêtes</span><span><b>{pending}</b> en cours</span><span><b>{errors}</b> erreurs</span><span><b>{(storageStatus.storageBytes / 1024).toFixed(1)} Ko</b> occupés dans le stockage local</span></div>
    {storageStatus.storageWarning && <p className="network-error" role="alert">{storageStatus.storageWarning}</p>}
    <div className="network-inspector-layout">
      <section className="network-request-list" aria-label="Liste des requêtes">
        <div className="network-request-toolbar"><input aria-label="Rechercher une requête" placeholder="Filtrer par URL, méthode, réponse…" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="network-filter-buttons" role="group" aria-label="Filtrer par statut">{(['all','pending','error','success'] as Filter[]).map((item) => <button key={item} type="button" className={filter === item ? 'active' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === 'all' ? 'Toutes' : item === 'pending' ? 'En cours' : item === 'error' ? 'Erreurs' : 'Terminées'}</button>)}</div></div>
        <div className="network-request-table" role="list" aria-label="Requêtes HTTP">
          {filtered.map((record) => <button type="button" role="listitem" key={record.id} className={selected?.id === record.id ? 'network-request-row selected' : 'network-request-row'} onClick={() => setSelectedId(record.id)}>
            <span className="network-method">{record.method}</span><span className="network-url" title={record.url}>{record.url}</span><span className={`network-state ${record.state}`}>{record.state === 'pending' ? '…' : record.status ?? 'ERR'}</span><span className="network-duration">{formatDuration(record.durationMs)}</span>
          </button>)}
          {!filtered.length && <p className="network-empty">Aucune requête. Les prochains appels HTTP apparaîtront ici.</p>}
        </div>
      </section>
      <section className="network-request-details" aria-label="Détail de la requête">
        {selected ? <>
          <div className="network-selected-heading"><div><span className="network-method">{selected.method}</span><strong>{selected.url}</strong></div><span>{formatTime(selected.startedAt)} · {formatDuration(selected.durationMs)}</span></div>
          <nav className="network-detail-tabs" aria-label="Détails réseau">{(['headers','request','response'] as const).map((item) => <button type="button" key={item} className={tab === item ? 'active' : ''} aria-pressed={tab === item} onClick={() => setTab(item)}>{item === 'headers' ? 'Headers' : item === 'request' ? 'Payload' : 'Response'}</button>)}</nav>
          {tab === 'headers' && <><Detail title="General" value={{ url: selected.url, method: selected.method, status: selected.status ? `${selected.status} ${selected.statusText}` : 'En attente' }} /><Detail title="Request headers" value={selected.requestHeaders} /><Detail title="Response headers" value={selected.responseHeaders} /></>}
          {tab === 'request' && <Detail title="Request payload" value={selected.requestBody} />}
          {tab === 'response' && <><Detail title="Response body" value={selected.responseBody} />{selected.error && <p className="network-error">{selected.error}</p>}</>}
        </> : <p className="network-empty">Sélectionnez une requête pour examiner ses détails.</p>}
      </section>
    </div>
    <p className="network-inspector-footnote">Les corps complets restent en mémoire pendant la session ; seuls 4 000 caractères par corps sont persistés localement. Les clés, tokens et données binaires sont masqués. L’historique est limité aux 100 dernières requêtes.</p>
  </main>;
}
