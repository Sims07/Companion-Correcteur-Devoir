import { useEffect, useState } from 'react';
import { appReleaseUrl, compareAppVersions, type AppBuildVersion, type AppVersionStatus } from '../../domain/appBuildVersion.ts';
import { appReleaseApiUrl, readAppReleaseNotes } from '../../domain/appReleaseNotes.ts';
import './AppVersionBadge.css';

const installedBuild: AppBuildVersion = {
  version: import.meta.env.VITE_APP_VERSION || '0.0.0',
  revision: import.meta.env.VITE_EVALUATION_REVISION || null,
};

const releaseTag: string | null = import.meta.env.VITE_APP_RELEASE_TAG || null;

export function AppVersionBadge() {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<AppVersionStatus>('unverified');
  const [notesState, setNotesState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    const abortController = new AbortController();
    // Static metadata only: no student copy or grading content leaves the device.
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

  const releaseUrl = appReleaseUrl(releaseTag);
  const releaseApiUrl = appReleaseApiUrl(releaseTag);

  useEffect(() => {
    if (!open || !releaseApiUrl) return;
    const controller = new AbortController();
    setNotesState('loading');
    // The release is created after the site is deployed: read its notes only
    // when someone opens this panel. The request contains no application data.
    void fetch(releaseApiUrl, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Release notes unavailable');
      return await response.json() as unknown;
    }).then((payload) => {
      if (controller.signal.aborted) return;
      setNotes(readAppReleaseNotes(payload));
      setNotesState('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setNotesState('error');
    });
    return () => controller.abort();
  }, [open, releaseApiUrl]);

  const verifiedRevision = installedBuild.revision && /^[0-9a-f]{7,40}$/i.test(installedBuild.revision)
    ? installedBuild.revision : null;

  return (
    <div className="app-version-wrap">
      <button type="button" className="app-version-trigger"
        aria-label={`Version de l’application : v${installedBuild.version}`}
        aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>v{installedBuild.version}</span>
        {status === 'current' && <span className="app-version-current">À jour</span>}
        {status === 'outdated' && <span className="app-version-outdated">Mise à jour</span>}
      </button>
      {open && <section className="app-version-details" aria-label="Détails de la version">
        <h2>Version installée : v{installedBuild.version}</h2>
        <p className="app-version-status" role="status">{checking ? 'Vérification de la version publiée…'
          : status === 'current' ? 'Vous utilisez la dernière version publiée.'
          : status === 'outdated' ? 'Une nouvelle version est disponible.'
          : 'Vérification des mises à jour indisponible (hors ligne ou version locale).'}</p>

        <h3>Nouveautés de cette version</h3>
        {!releaseApiUrl ? <p>Les nouveautés seront disponibles pour une version publiée.</p>
          : notesState === 'loading' ? <p>Chargement des nouveautés…</p>
          : notesState === 'error' ? <p>Nouveautés indisponibles pour le moment. Vous pouvez consulter la publication sur GitHub.</p>
          : notes.length === 0 ? <p>Aucune nouveauté détaillée dans cette publication.</p>
          : <ul className="app-version-notes">{notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
        {releaseUrl && <a className="app-version-release-link" href={releaseUrl} target="_blank" rel="noreferrer">Voir toutes les nouveautés sur GitHub</a>}
        {status === 'outdated' && <button type="button" className="app-version-reload"
          onClick={() => window.location.reload()}>Recharger la dernière version</button>}

        <details className="app-version-technical">
          <summary>Détails techniques</summary>
          <p>Identifiant du build : <code>{installedBuild.revision ?? 'non disponible (local)'}</code></p>
          {verifiedRevision && <a href={`https://github.com/Sims07/Companion-Correcteur-Devoir/commit/${verifiedRevision}`}
            target="_blank" rel="noreferrer">Voir le commit sur GitHub</a>}
        </details>
      </section>}
    </div>
  );
}
