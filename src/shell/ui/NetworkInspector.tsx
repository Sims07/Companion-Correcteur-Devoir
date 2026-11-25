import { useEffect, useMemo, useState } from 'react';
import { clearNetworkHistory, getNetworkInspectorStatus, loadNetworkHistory, networkInspectorEvent, type NetworkRequestRecord } from '../../shared/adapters/network/networkInspector.ts';
import '../../shared/ui/networkInspector.css';
import { isOllamaInferenceRequest } from '../../shared/domain/ollamaTimings.ts';
import { extractOllamaMessage, extractOllamaThinking } from '../../shared/domain/ollamaThinkingStream.ts';
import { extractOpenAiCompletion, isLmStudioChat, isOpenAiCompletionRequest, isOpenAiResponsesRequest } from '../../shared/domain/openAiCompletionStream.ts';
import { modelTokenRate } from '../../shared/domain/modelTokenRate.ts';

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

function requestedThinking(requestBody: string): { enabled: boolean; detail: string } | null {
  try {
    const parsed: unknown = JSON.parse(requestBody);
    if (!parsed || typeof parsed !== 'object') return null;
    const body = parsed as { think?: unknown; reasoning?: unknown; reasoning_effort?: unknown; chat_template_kwargs?: { enable_thinking?: unknown } };
    if (typeof body.reasoning === 'string') return { enabled: body.reasoning !== 'off', detail: `reasoning: ${body.reasoning}` };
    if (body.reasoning && typeof body.reasoning === 'object' && 'effort' in body.reasoning && typeof body.reasoning.effort === 'string') {
      return { enabled: body.reasoning.effort !== 'none', detail: `reasoning.effort: ${body.reasoning.effort}` };
    }
    if (typeof body.reasoning_effort === 'string') {
      return { enabled: body.reasoning_effort !== 'none', detail: `reasoning_effort: ${body.reasoning_effort}` };
    }
    if (typeof body.chat_template_kwargs?.enable_thinking === 'boolean') {
      return { enabled: body.chat_template_kwargs.enable_thinking, detail: `enable_thinking: ${body.chat_template_kwargs.enable_thinking}` };
    }
    if (typeof body.think === 'boolean') return { enabled: body.think, detail: `think: ${body.think}` };
  } catch { /* Older or incomplete requests have no readable setting. */ }
  return null;
}

function Detail({ title, value }: { title: string; value: unknown }) {
  return <section className="network-detail-section"><h3>{title}</h3><pre>{formatDetail(value)}</pre></section>;
}

type NetworkInspectorProps = {
  initialFilter?: 'all' | 'error';
  hasRunningCorrections?: boolean;
  isStoppingCorrections?: boolean;
  onStopCorrections?: () => void;
};

export function NetworkInspector({ initialFilter = 'all', hasRunningCorrections = false, isStoppingCorrections = false, onStopCorrections }: NetworkInspectorProps) {
  const [records, setRecords] = useState<NetworkRequestRecord[]>(loadNetworkHistory);
  const [selectedId, setSelectedId] = useState<string | null>(records[0]?.id ?? null);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'headers' | 'request' | 'response' | 'message' | 'thinking'>('headers');
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
  const tokenRateLabel = (record: NetworkRequestRecord) => {
    const rate = modelTokenRate(record);
    return rate ? `${rate.tokensPerSecond.toFixed(1)} tok/s` : null;
  };
  const selectedTokenRate = selected ? modelTokenRate(selected) : null;
  const ollamaSelected = Boolean(selected && isOllamaInferenceRequest(selected.url));
  const completionSelected = Boolean(selected && (isOpenAiCompletionRequest(selected.url) || isOpenAiResponsesRequest(selected.url) || isLmStudioChat(selected.url)));
  const legacyCompletion = useMemo(() => completionSelected && selected
    ? extractOpenAiCompletion(selected.responseBody) : null, [completionSelected, selected?.responseBody]);
  const selectedThinking = ollamaSelected && selected
    ? selected.thinkingBody || extractOllamaThinking(selected.responseBody)
    : completionSelected && selected ? selected.thinkingBody ?? legacyCompletion?.thinking ?? '' : '';
  const selectedMessage = ollamaSelected && selected
    ? selected.messageBody ?? extractOllamaMessage(selected.responseBody)
    : completionSelected && selected ? selected.messageBody ?? legacyCompletion?.message ?? '' : '';
  const thinkingRequested = selected ? requestedThinking(selected.requestBody) : null;
  const longRubricThinking = selected?.intent === 'Vérifier et clarifier le barème'
    && selected.state === 'pending' && selected.status !== null
    && Boolean(selectedThinking) && !selectedMessage && (liveDuration(selected) ?? 0) >= 300_000;
  const unexplainedGap = selected?.providerTimings && selected.durationMs !== null
    ? selected.durationMs - selected.providerTimings.totalMs : null;

  return <section className="network-inspector" aria-label="Inspecteur réseau">
    <header className="network-inspector-heading">
      <div><p className="eyebrow">OUTILS DE DÉVELOPPEMENT</p><h1>Inspecteur réseau</h1><p>Suivez les requêtes HTTP de l’application en direct et consultez leur historique local.</p></div>
      <div className="network-inspector-actions">{hasRunningCorrections && onStopCorrections && <button type="button" className="context-stop-button" disabled={isStoppingCorrections} onClick={onStopCorrections} aria-label="Arrêter la correction en cours">{isStoppingCorrections ? 'Arrêt en cours…' : 'Arrêter la correction'}</button>}<span className="network-local-indicator">● Historique local</span><button type="button" className="secondary-button" onClick={() => { clearNetworkHistory(); setRecords([]); setSelectedId(null); setStorageStatus(getNetworkInspectorStatus()); }}>Effacer l’historique</button></div>
    </header>
    <div className="network-inspector-summary"><span><b>{records.length}</b> requêtes</span><span className={pending > 0 ? 'network-pending-badge' : ''}><b>{pending}</b> requête(s) en cours</span><span><b>{errors}</b> erreurs</span><span><b>{(storageStatus.storageBytes / 1024).toFixed(1)} Ko</b> occupés dans le stockage local</span></div>
    {storageStatus.storageWarning && <p className="network-error" role="alert">{storageStatus.storageWarning}</p>}
    <div className="network-inspector-layout">
      <section className="network-request-list" aria-label="Liste des requêtes">
        <div className="network-request-toolbar"><input aria-label="Rechercher une requête" placeholder="Filtrer par intention, contexte, URL…" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="network-filter-buttons" role="group" aria-label="Filtrer par statut">{(['all','pending','error','success'] as Filter[]).map((item) => <button key={item} type="button" className={filter === item ? 'active' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === 'all' ? 'Toutes' : item === 'pending' ? 'En cours' : item === 'error' ? 'Erreurs' : 'Terminées'}</button>)}</div></div>
        <div className="network-request-table" role="list" aria-label="Requêtes HTTP">
          <div className="network-request-columns" aria-hidden="true"><span>Heure</span><span>Méthode</span><span>URL</span><span>Intention</span><span>HTTP</span><span>Durée modèle / réseau</span></div>
          {filtered.map((record) => <button type="button" role="listitem" key={record.id} className={selected?.id === record.id ? 'network-request-row selected' : 'network-request-row'} onClick={() => setSelectedId(record.id)}>
            <span className="network-request-time" title={new Date(record.startedAt).toLocaleString("fr-FR")}>{formatTime(record.startedAt)}</span><span className="network-method">{record.method}</span><span className="network-url" title={record.url}>{record.url}</span><span className="network-intent" title={record.context ? `${record.intent} · ${record.context}` : record.intent}><strong>{record.intent}</strong>{record.context && <small>{record.context}</small>}</span><span className={`network-state ${record.state}`}>{record.state === 'pending' ? '…' : record.status ?? 'ERR'}</span><span className="network-duration" title={modelDurationLabel(record)}>{formatDuration(visibleDuration(record))}{isOllamaInferenceRequest(record.url) && record.state !== 'pending' && <small>{record.providerTimings ? 'Ollama' : 'Non mesuré'}</small>}{tokenRateLabel(record) && <small className="network-token-rate" title={modelTokenRate(record)?.source === 'native' ? 'Vitesse native de génération Ollama' : 'Débit bout-en-bout, temps réseau inclus'}>{tokenRateLabel(record)}</small>}{waitingForServer(record) && <small className="network-waiting-hint">En attente du serveur (modèle en cours de chargement ?)</small>}</span>
          </button>)}
          {!filtered.length && <p className="network-empty">Aucune requête. Les prochains appels HTTP apparaîtront ici.</p>}
        </div>
      </section>
      <section className="network-request-details" aria-label="Détail de la requête">
        {selected ? <>
          <div className="network-selected-heading"><div><span className="network-method">{selected.method}</span><strong>{selected.url}</strong></div><span>{formatTime(selected.startedAt)} · {formatDuration(visibleDuration(selected))} · {modelDurationLabel(selected)}</span></div>
          <section className="network-intent-detail" aria-label="Intention de la requête"><h3>Intention</h3><p>{selected.intent || 'Intention non renseignée'}</p>{selected.context && <small>{selected.context}</small>}{waitingForServer(selected) && <p className="network-waiting-hint" role="status">En attente du serveur (modèle en cours de chargement ?)</p>}
             {completionSelected && thinkingRequested && <p className="network-stream-hint">Raisonnement demandé : <strong>{thinkingRequested.enabled ? 'activé' : 'désactivé'}</strong> ({thinkingRequested.detail}). Ce paramètre peut être ignoré par le serveur ou le modèle.</p>}
             {completionSelected && thinkingRequested?.enabled === false && selectedThinking && <p className="network-waiting-hint" role="status">Le fournisseur transmet du raisonnement malgré la désactivation demandée.</p>}
             {completionSelected && selected.finishReason && <p className="network-stream-hint">Fin de génération : {selected.finishReason}{selected.finishReason === 'length' ? ' · limite de tokens atteinte, réponse possiblement tronquée' : ''}</p>}
             {completionSelected && selected.state === 'success' && !selectedMessage.trim() && <p className="network-waiting-hint" role="status">La requête HTTP s’est terminée sans texte de réponse finale exploitable. Aucune note ne doit être déduite de ce résultat.</p>}
             {selected.state === 'pending' && selected.status !== null && <p className="network-stream-hint" role="status">{[selectedThinking && `Thinking reçu : ${selected.thinkingCharacters ?? selectedThinking.length} caractères`, selectedMessage && `Message reçu : ${selected.messageCharacters ?? selectedMessage.length} caractères`].filter(Boolean).join(' · ') || (selected.responseBody ? 'Flux de réponse reçu · traitement en cours' : 'Réponse HTTP reçue · en attente des premiers fragments')}</p>}
            {longRubricThinking && <p className="network-waiting-hint" role="status">Raisonnement prolongé : plus de cinq minutes sans réponse JSON. Le modèle consomme du temps et des tokens en Thinking ; la vérification du barème n’aboutira qu’après réception du JSON complet. Vous pouvez arrêter cette vérification depuis le barème sans perdre les validations existantes.</p>}
             {isOllamaInferenceRequest(selected.url) && selected.state !== 'pending' && <div className="network-native-timing" aria-label="Durées de la requête">
              <p><strong>Temps Ollama : {formatDuration(selected.providerTimings?.totalMs ?? null)}</strong> · Temps navigateur : {formatDuration(selected.durationMs)}</p>
              {selected.providerTimings && <p>Chargement : {formatDuration(selected.providerTimings.loadMs ?? null)} · Prompt : {formatDuration(selected.providerTimings.promptEvaluationMs ?? null)} · Génération : {formatDuration(selected.providerTimings.generationMs ?? null)}</p>}
              {unexplainedGap !== null && unexplainedGap > 60_000 && unexplainedGap > selected.providerTimings!.totalMs * 2 && <p className="network-waiting-hint" role="status">Écart important entre Ollama et le navigateur : veille, attente ou interruption possible. Écart : {formatDuration(unexplainedGap)}.</p>}
            </div>}
            {selectedTokenRate && <div className="network-token-metrics" aria-label="Débit des tokens">
               <p><strong>{selectedTokenRate.tokensPerSecond.toFixed(1)} tokens/s</strong> · {selectedTokenRate.source === 'native' ? 'Vitesse native de génération (Ollama)' : 'Débit bout-en-bout estimé (tokens générés / temps réseau, prétraitement inclus)'}</p>
               <p>Tokens générés : {selectedTokenRate.completionTokens}{selectedTokenRate.promptTokens !== undefined ? ` · Tokens du prompt : ${selectedTokenRate.promptTokens}` : ''}</p>
             </div>}
             {selected.state === 'error' && selected.error && <p className="network-error" role="alert"><strong>{selected.status === null ? 'Requête interrompue sans réponse HTTP : ' : 'Erreur réseau : '}</strong>{selected.error}</p>}
          </section>
          <nav className="network-detail-tabs" aria-label="Détails réseau">{(['headers','request','response','message','thinking'] as const).map((item) => <button type="button" key={item} className={tab === item ? 'active' : ''} aria-pressed={tab === item} onClick={() => setTab(item)}>{item === 'headers' ? 'Headers' : item === 'request' ? 'Payload' : item === 'response' ? 'Response' : item === 'message' ? 'Message' : 'Thinking'}</button>)}</nav>
          <div className={`network-detail-body${tab === 'headers' ? '' : ' network-detail-body--single'}`}>
          {tab === 'headers' && <><Detail title="General" value={{ url: selected.url, method: selected.method, status: selected.status ? `${selected.status} ${selected.statusText}` : 'En attente' }} /><Detail title="Request headers" value={selected.requestHeaders} /><Detail title="Response headers" value={selected.responseHeaders} /></>}
          {tab === 'request' && <Detail title="Request payload" value={selected.requestBody} />}
          {tab === 'response' && <Detail title="Response body" value={selected.responseBody} />}
          {tab === 'message' && (selectedMessage.trim()
            ? <Detail title="Message reçu du modèle" value={selectedMessage} />
            : <p className="network-empty" role="status">{!ollamaSelected && !completionSelected
              ? 'La réponse de ce service ne comporte pas de flux de génération reconnu.'
              : selectedMessage.length > 0
                ? 'Le modèle n’a transmis que des caractères blancs ; aucune réponse finale exploitable pour le moment.'
                : selected.state === 'pending'
                  ? ollamaSelected
                    ? 'Aucun fragment de message.content reçu pour le moment. Le modèle peut encore réfléchir ou préparer sa réponse.'
                    : 'Aucun fragment de réponse finale reçu pour le moment. Le modèle peut encore préparer sa réponse.'
                  : 'Aucun texte de réponse finale transmis par le modèle pour cette requête.'}</p>)}
           {tab === 'thinking' && (selectedThinking
             ? <Detail title="Thinking reçu du modèle" value={selectedThinking} />
             : <p className="network-empty" role="status">{!ollamaSelected && !completionSelected
               ? 'Le raisonnement n’est pas disponible pour ce type de requête.'
               : thinkingRequested?.enabled === false
                 ? 'Thinking désactivé demandé pour cette requête ; aucun raisonnement transmis.'
                 : selected.state === 'pending'
                   ? 'Aucun fragment de thinking reçu pour le moment. Le modèle peut encore charger ou ne pas exposer son raisonnement.'
                   : 'Aucun thinking transmis par le modèle pour cette requête. Le modèle peut ne pas exposer son raisonnement.'}</p>)}
          </div>
        </> : <p className="network-empty">Sélectionnez une requête pour examiner ses détails.</p>}
      </section>
    </div>
    <p className="network-inspector-footnote">Les réponses réseau sont limitées dans l’inspecteur. En cours de génération, Thinking affiche les derniers caractères reçus (20 000 au maximum), avec le total exact depuis le début ; Message conserve un aperçu du début de la réponse. Seuls 4 000 caractères par corps sont persistés localement. Les clés, tokens et données binaires sont masqués. L’historique est limité aux 100 dernières requêtes.</p>
  </section>;
}
