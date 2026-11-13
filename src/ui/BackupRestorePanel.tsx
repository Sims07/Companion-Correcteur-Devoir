import { useRef, useState } from 'react';
import {
  createLocalBackup, parseLocalBackup, restoreLocalBackup, summarizeLocalBackup,
  type LocalBackup, type RestoreMode,
} from '../adapters/storage/localBackup.ts';
import {
  LARGE_BACKUP_THRESHOLD, restoreInspectedBackupSettings, type LargeBackupInspection,
} from '../adapters/storage/largeBackupStream.ts';
import {
  inspectLargeBackupInWorker, restoreLargeBackupInWorker,
  type LargeBackupProgress,
} from '../adapters/storage/largeBackupWorkerClient.ts';
import { describeLargeBackupFailure } from '../adapters/storage/largeBackupError.ts';
import './backupRestorePanel.css';

const IMPORT_MARKER = 'companion:backup-import-in-progress:v1';
type Stage = 'analyse' | 'restauration';
function saveStage(stage: Stage, percent: number, records: number): void {
  try {
    window.sessionStorage.setItem(IMPORT_MARKER, JSON.stringify({ stage, percent, records }));
  } catch { /* The import must still run if sessionStorage is unavailable. */ }
}
function clearStage(): void {
  try { window.sessionStorage.removeItem(IMPORT_MARKER); }
  catch { /* Nonessential diagnostic marker. */ }
}
function interruptedImport(): string {
  try {
    const value = window.sessionStorage.getItem(IMPORT_MARKER);
    if (!value) return '';
    const marker = JSON.parse(value) as { stage: Stage; percent: number; records: number };
    return 'La tentative précédente a été interrompue pendant ' + marker.stage +
      ' vers ' + marker.percent + ' %. ' +
      (marker.records ? marker.records + ' enregistrement(s) pouvaient déjà avoir été restaurés. ' : '') +
      'Le fichier original reste intact. Vous pouvez réessayer en mode « conserver ».';
  } catch { return ''; }
}

type Props = { onRestored?: () => void };

export function BackupRestorePanel({ onRestored }: Props) {
  const [selected, setSelected] = useState<LocalBackup | null>(null);
  const [largeFile, setLargeFile] = useState<File | null>(null);
  const [largeInspection, setLargeInspection] = useState<LargeBackupInspection | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [recordsHandled, setRecordsHandled] = useState(0);
  const [interrupted, setInterrupted] = useState(interruptedImport);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const handledRef = useRef(0);

  function progressFor(stageName: Stage): (update: LargeBackupProgress) => void {
    let latestPercent = 0;
    return (update) => {
      if (update.percent >= 0) {
        latestPercent = update.percent;
        setProgress(update.percent);
      }
      if (update.recordsHandled > 0) {
        handledRef.current = update.recordsHandled;
        setRecordsHandled(update.recordsHandled);
      }
      saveStage(stageName, latestPercent, update.recordsHandled);
    };
  }

  async function exportBackup() {
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const backup = await createLocalBackup();
      const file = new Blob([JSON.stringify(backup)], { type: 'application/json;charset=utf-8' });
      const link = URL.createObjectURL(file);
      try {
        const anchor = document.createElement('a');
        anchor.href = link;
        anchor.download = 'compagnon-sauvegarde-' + backup.createdAt.slice(0, 10) + '.json';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(link), 10_000);
      }
      const summary = summarizeLocalBackup(backup);
      setMessage('Sauvegarde téléchargée : ' + summary.recordCount + ' enregistrement(s), '
        + summary.settingCount + ' réglage(s), ' + summary.biologyObservationCount + ' observation(s) Biologie.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de sauvegarder les données.');
    } finally { setWorking(false); }
  }

  async function chooseFile(file?: File) {
    setSelected(null);
    setLargeFile(null);
    setLargeInspection(null);
    setProgress(null);
    setStage(null);
    setRecordsHandled(0);
    handledRef.current = 0;
    setInterrupted('');
    clearStage();
    setFileName('');
    setRestored(false);
    setError('');
    setMessage('');
    if (!file) return;
    setWorking(true);
    try {
      if (file.size >= LARGE_BACKUP_THRESHOLD) {
        // A 660 MB backup cannot reliably be decoded into a single V8 string.
        // Inspect it progressively, holding no complete backup in memory.
        setStage('analyse');
        setProgress(0);
        saveStage('analyse', 0, 0);
        const inspection = await inspectLargeBackupInWorker(file, progressFor('analyse'));
        setLargeFile(file);
        setLargeInspection(inspection);
        setMessage('Analyse terminée. Vérifiez le résumé, puis cliquez sur « Restaurer la sauvegarde ».');
      } else {
        const backup = parseLocalBackup(await file.text());
        setSelected(backup);
      }
      setFileName(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Fichier de sauvegarde invalide.');
      if (fileInput.current) fileInput.current.value = '';
    } finally { setWorking(false); setProgress(null); setStage(null); clearStage(); }
  }

  async function importBackup() {
    if (!selected && (!largeFile || !largeInspection)) return;
    if (mode === 'update' && !window.confirm(
      'Mettre à jour les données et réglages de même identifiant ? Les autres données resteront conservées.',
    )) return;
    setWorking(true);
    setError('');
    setMessage('');
    setStage('restauration');
    setRecordsHandled(0);
    handledRef.current = 0;
    setProgress(0);
    saveStage('restauration', 0, 0);
    let settingsRecovered = false;
    let settingsResult: Awaited<ReturnType<typeof restoreInspectedBackupSettings>> | null = null;
    let succeeded = false;
    try {
      if (largeFile && largeInspection) {
        // Recover the 16 settings (including biology radar history) independently
        // of large IndexedDB photo archives and their browser storage limits.
        settingsResult = await restoreInspectedBackupSettings(largeInspection, mode);
        settingsRecovered = true;
        setMessage('Réglages et historiques locaux restaurés. Import des archives en cours…');
      }
      const result = largeFile && largeInspection
        ? await restoreLargeBackupInWorker(largeFile, largeInspection, mode, progressFor('restauration'))
        : await restoreLocalBackup(selected!, mode);
      succeeded = true;
      setRestored(true);
      const restoredRecords = mode === 'update'
        ? result.recordsUpdated + ' enregistrement(s) ajouté(s) ou mis à jour'
        : result.recordsImported + ' enregistrement(s) ajouté(s), ' + result.recordsPreserved + ' conflit(s) conservé(s)';
      setMessage(
        'Restauration terminée : ' + restoredRecords + '. '
        + (settingsResult?.settingsImported ?? result.settingsImported) + ' réglage(s) importé(s) ou mis à jour, '
        + (settingsResult?.settingsPreserved ?? result.settingsPreserved) + ' réglage(s) déjà présent(s) conservé(s). '
        + 'Rechargez l’application pour retrouver vos données.',
      );
      onRestored?.();
    } catch (cause) {
      const explanation = cause instanceof Error && cause.message.trim()
        ? cause.message : describeLargeBackupFailure(cause);
      setError(explanation);
      setMessage(
        (settingsRecovered ? 'Les réglages et historiques Biologie ont été récupérés. ' : '') +
        (handledRef.current
          ? handledRef.current + ' enregistrement(s) ont été traités avant l’arrêt. ' : '') +
        'Les éléments déjà enregistrés sont conservés ; le fichier original n’est pas modifié.',
      );
      setInterrupted(
        'La restauration a échoué. Pour reprendre sans réécrire les enregistrements déjà ' +
        'présents, laissez la case « Mettre à jour » décochée.',
      );
      if (settingsRecovered || handledRef.current > 0) onRestored?.();
    } finally {
      setWorking(false);
      setProgress(null);
      setStage(null);
      // Preserve the marker on failure: a later reload can report the interruption.
      if (succeeded) clearStage();
    }
  }

  const preview = largeInspection?.summary ?? (selected ? summarizeLocalBackup(selected) : null);

  return <section className="backup-restore-panel" aria-labelledby="backup-restore-title">
    <div className="backup-restore-heading">
      <div>
        <h4 id="backup-restore-title">Sauvegarde et transfert</h4>
        <p>Pour passer de npm run dev à la PWA, sauvegardez ici puis importez le fichier sur l’autre adresse, dans le même navigateur ou un autre.</p>
      </div>
      <button type="button" className="secondary-button" disabled={working} onClick={() => void exportBackup()}>
        {working ? 'Opération en cours…' : 'Télécharger ma sauvegarde'}
      </button>
    </div>
    <div className="backup-restore-import">
      <label htmlFor="backup-restore-file"><strong>Restaurer depuis un fichier</strong></label>
      <input id="backup-restore-file" ref={fileInput} type="file" accept=".json,application/json"
        disabled={working} onChange={(event) => void chooseFile(event.target.files?.[0])} />
      {interrupted && <p role="alert" className="storage-usage-notice is-warning">{interrupted}</p>}
      {working && progress !== null && <p role="status" aria-live="polite">
        {stage === 'analyse' ? 'Analyse du fichier (aucune donnée encore restaurée)' : 'Restauration des données'} :
        {' '}{progress} %
        {stage === 'restauration' && recordsHandled > 0
          ? ' · ' + recordsHandled + ' enregistrement(s) traités' : ''}
      </p>}
      {preview && <div className="backup-restore-preview" role="status">
        <strong>{fileName}</strong>
        <span>Créée le {new Date(preview.createdAt).toLocaleString('fr-FR')} · {preview.recordCount} enregistrement(s) · {preview.settingCount} réglage(s)</span>
        <span><strong>Radar Biologie : {preview.biologyObservationCount} observation(s) dans ce fichier.</strong></span>
        <span>Copies, corrections, évaluations, radars, campagnes et configuration, selon les données effectivement enregistrées.</span>
      </div>}
      {preview && preview.biologyObservationCount === 0 && <p className="storage-usage-notice is-warning" role="status">
        Ce fichier ne contient pas d’observations du radar Biologie. Si tes résultats existent encore sur localhost,
        refais une sauvegarde depuis cette installation avant de réessayer.
      </p>}
      {preview && <p className="backup-restore-guidance">Sur une nouvelle PWA, cochez « Mettre à jour » pour reprendre aussi votre devoir par défaut et vos réglages IA de localhost. Les données absentes du fichier ne seront jamais supprimées.</p>}
      {largeInspection && <p className="backup-restore-guidance">
        Sauvegarde volumineuse : les réglages et radars sont restaurés en premier.
        Pour reprendre un import interrompu, laissez « Mettre à jour » décoché :
        les enregistrements déjà présents seront conservés sans être réécrits.
      </p>}
      {preview && <label className="backup-restore-mode">
        <input type="checkbox" checked={mode === 'update'} disabled={working}
          onChange={(event) => setMode(event.target.checked ? 'update' : 'merge')} />
        Mettre à jour les éléments de même identifiant (sinon, conserver les données existantes)
      </label>}
      <div className="backup-restore-actions">
        <button type="button" className="secondary-button" disabled={(!selected && !largeFile) || working}
          onClick={() => void importBackup()}>{working ? 'Restauration…' : 'Restaurer la sauvegarde'}</button>
        {restored && <button type="button" className="secondary-button" onClick={() => window.location.reload()}>
          Recharger l’application
        </button>}
      </div>
      {error && <p role="alert" className="storage-usage-notice is-error">{error}</p>}
      {message && <p role="status" className="storage-usage-notice">{message}</p>}
      <small>Les sauvegardes volumineuses sont analysées et restaurées progressivement pour éviter de saturer la mémoire. Le fichier reste sur votre appareil. Il peut contenir les copies et les réglages de connexion : conservez-le dans un endroit sûr.</small>
    </div>
  </section>;
}
