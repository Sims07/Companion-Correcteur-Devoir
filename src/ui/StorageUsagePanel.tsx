import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StorageDiagnosticsService } from '../application/storageDiagnosticsService.ts';
import { formatStorageBytes, storageOccupancyPercent, type StorageDiagnosticsSnapshot } from '../domain/storageDiagnostics.ts';
import './storageUsagePanel.css';

interface Props {
  service?: StorageDiagnosticsService;
  onManageEvaluations?: () => void;
}

export function StorageUsagePanel({ service, onManageEvaluations }: Props) {
  const [snapshot, setSnapshot] = useState<StorageDiagnosticsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!service) return;
    setLoading(true);
    setError('');
    try { setSnapshot(await service.inspect()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible de mesurer le stockage local.'); }
    finally { setLoading(false); }
  }, [service]);
  const inspectedService = useRef<StorageDiagnosticsService | null>(null);
  useEffect(() => {
    // React StrictMode can run mount effects twice. Avoid scanning large local
    // copies twice while other grading jobs may need the same IndexedDB stores.
    if (!service || inspectedService.current === service) return;
    inspectedService.current = service;
    void refresh();
  }, [service, refresh]);
  const occupancy = snapshot ? storageOccupancyPercent(snapshot.originUsageBytes, snapshot.originQuotaBytes) : null;
  const storedBytes = useMemo(() => snapshot?.stores.reduce((sum, store) => sum + store.logicalBytes, 0) ?? 0, [snapshot]);

  function exportInventory() {
    if (!snapshot) return;
    // Export only numeric aggregates; never write content or identifiers of copies.
    const data = JSON.stringify({
      measuredAt: snapshot.measuredAt,
      originUsageBytes: snapshot.originUsageBytes,
      originQuotaBytes: snapshot.originQuotaBytes,
      persistent: snapshot.persistent,
      stores: snapshot.stores,
      warnings: snapshot.warnings,
      measurementNotes: 'Quota = toute l’origine du site; tailles par catégorie = empreinte UTF-16 approximative, pas les octets sur disque.',
    }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'compagnon-stockage-inventaire.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      // Safari may begin the download asynchronously after the click event.
      window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
    }
  }

  return <section className="observability-panel storage-usage-panel" aria-labelledby="storage-usage-title">
    <div className="observability-panel-heading">
      <div><p className="observability-eyebrow">CAPACITÉ LOCALE · NAVIGATEUR</p><h3 id="storage-usage-title">Occupation du stockage local</h3><p>Surveillez l’espace utilisé par les copies, les évaluations et les traces, sans transmettre leur contenu.</p></div>
      <button type="button" className="secondary-button" onClick={() => void refresh()} disabled={!service || loading}>{loading ? 'Mesure en cours…' : 'Actualiser'}</button>
    </div>
    {!service && <p className="storage-usage-notice">Les mesures de stockage ne sont pas configurées sur cet appareil.</p>}
    {error && <p className="storage-usage-notice is-error" role="alert">Mesure impossible : {error}</p>}
    {snapshot && <>
      <div className="storage-usage-kpis">
        <div><small>Utilisé par le site</small><strong>{formatStorageBytes(snapshot.originUsageBytes)}</strong></div>
        <div><small>Quota annoncé par le navigateur</small><strong>{formatStorageBytes(snapshot.originQuotaBytes)}</strong></div>
        <div><small>Occupation estimée</small><strong>{occupancy === null ? 'Non disponible' : occupancy.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %'}</strong></div>
        <div><small>Protection contre l’éviction</small><strong>{snapshot.persistent === null ? 'Inconnue' : snapshot.persistent ? 'Stockage persistant' : 'Stockage standard'}</strong></div>
      </div>
      <div className="storage-quota-chart">
        <div className="storage-chart-heading"><strong>Utilisation du quota de cette origine web</strong><span>{occupancy === null ? 'Estimation indisponible' : formatStorageBytes(snapshot.originUsageBytes) + ' / ' + formatStorageBytes(snapshot.originQuotaBytes)}</span></div>
        <div className="storage-quota-track" role={occupancy === null ? 'img' : 'progressbar'} aria-label="Occupation estimée du quota du navigateur" aria-valuemin={occupancy === null ? undefined : 0} aria-valuemax={occupancy === null ? undefined : 100} aria-valuenow={occupancy === null ? undefined : occupancy}><span style={{ width: occupancy === null ? '0%' : occupancy + '%' }} /></div>
        <p>Mesure fournie par le navigateur pour cette origine : IndexedDB et éventuellement autres stockages du site. Le quota n’est pas une promesse d’espace libre sur le disque.</p>
      </div>
      <div className="storage-breakdown">
        <div className="storage-chart-heading"><strong>Répartition indicative d’IndexedDB</strong><span>{snapshot.stores.reduce((sum, item) => sum + item.records, 0)} enregistrement(s)</span></div>
        {snapshot.stores.length ? <div className="storage-breakdown-bars">
          {snapshot.stores.map((store) => <div className="storage-breakdown-item" key={store.store}>
            <div className="storage-breakdown-label"><strong>{store.label}</strong><span>{store.records} élément(s) · ~{formatStorageBytes(store.logicalBytes)}</span></div>
            <div className="storage-breakdown-track" role="img" aria-label={store.label + ' : environ ' + formatStorageBytes(store.logicalBytes)}><span style={{ width: storedBytes > 0 ? Math.max(0, store.logicalBytes / storedBytes * 100) + '%' : '0%' }} /></div>
          </div>)}
        </div> : <p className="storage-usage-notice">Aucune catégorie mesurée, ou base IndexedDB inaccessible.</p>}
        <p>Les tailles par catégorie sont des <strong>ordres de grandeur calculés sur les valeurs</strong> (chaînes UTF-16). Elles ne doivent pas être additionnées au quota réel, ni confondues avec la taille physique sur disque.</p>
      </div>
      {occupancy !== null && occupancy >= 80 && <p className="storage-usage-notice is-warning" role="status">L’occupation approche du quota annoncé : pensez à vérifier vos archives locales et l’espace disque disponible.</p>}
      {snapshot.warnings.length > 0 && <ul className="storage-usage-warnings">{snapshot.warnings.map((message, index) => <li key={index}>{message}</li>)}</ul>}
      <div className="storage-usage-actions">
        {onManageEvaluations && <button type="button" className="secondary-button" onClick={onManageEvaluations}>Gérer les évaluations enregistrées</button>}
        <button type="button" className="text-button" onClick={exportInventory}>Exporter l’inventaire (sans copies)</button>
        <span>Aucune donnée n’est effacée automatiquement.</span>
      </div>
      <small className="storage-usage-updated">Dernière mesure : {new Date(snapshot.measuredAt).toLocaleString('fr-FR')}</small>
    </>}
    {!snapshot && loading && <p className="storage-usage-notice is-loading" role="status">Lecture des catégories IndexedDB sur cet appareil…</p>}
  </section>;
}
