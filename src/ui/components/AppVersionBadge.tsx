import { useEffect, useState } from 'react';
import { appReleaseUrl, compareAppVersions, shortAppRevision, type AppBuildVersion, type AppVersionStatus } from '../../domain/appBuildVersion.ts';
import './AppVersionBadge.css';

const installedBuild: AppBuildVersion = {
  version: import.meta.env.VITE_APP_VERSION || '0.0.0',
  revision: import.meta.env.VITE_EVALUATION_REVISION || null,
};

export function AppVersionBadge() {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<AppVersionStatus>('unverified');

  useEffect(() => {
    const abortController = new AbortController();
    // The file is emitted by the production build, but deliberately not cached by the PWA.
    void fetch(`${import.meta.env.BASE_URL}version.json`, {
      cache: 'no-store',
      signal: abortController.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('Version manifest unavailable');
      return await response.json() as unknown;
    }).then((published) => {
      if (abortController.signal.aborted) return;
      setStatus(compareAppVersions(installedBuild, published));
      setChecking(false);
    }).catch(() => {
      if (abortController.signal.aborted) return;
      setStatus('unverified');
      setChecking(false);
    });
    return () => abortController.abort();
  }, []);

  const revision = shortAppRevision(installedBuild.revision);
  const releaseUrl = appReleaseUrl(import.meta.env.VITE_APP_RELEASE_TAG);
  const verifiedRevision = installedBuild.revision && /^[0-9a-f]{7,40}$/i.test(installedBuild.revision)
    ? installedBuild.revision : null;

  return (
    <div className="app-version-wrap">
      <button type="button" className="app-version-trigger"
        aria-label={`Version de l’application : v${installedBuild.version}, build ${revision}`}
        aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>v{installedBuild.version}</span>
        <span className="app-version-revision">· {revision}</span>
        {status === 'current' && <span className="app-version-current">À jour</span>}
        {status === 'outdated' && <span className="app-version-outdated">Mise à jour</span>}
      </button>
      {open && <section className="app-version-details" aria-label="Détails de la version">
        <strong>Version installée : v{installedBuild.version}</strong>
        <p>Build : <code>{installedBuild.revision ?? 'non disponible (local)'}</code></p>
        <p role="status">{checking ? 'Vérification de la version publiée…'
          : status === 'current' ? 'Cette installation utilise la dernière version publiée.'
          : status === 'outdated' ? 'Nouvelle version disponible.'
          : 'Impossible de confirmer la dernière version (hors ligne ou build local).'}</p>
        {releaseUrl && <a href={releaseUrl} target="_blank" rel="noreferrer">Voir la release GitHub</a>}
        {verifiedRevision && <a href={`https://github.com/Sims07/Companion-Correcteur-Devoir/commit/${verifiedRevision}`}
          target="_blank" rel="noreferrer">{releaseUrl ? 'Voir le commit (lien permanent)' : 'Voir le build sur GitHub'}</a>}
        {status === 'outdated' && <button type="button" className="app-version-reload"
          onClick={() => window.location.reload()}>Recharger la dernière version</button>}
      </section>}
    </div>
  );
}
