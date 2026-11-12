import { useRef, useState } from 'react';
import {
  createLocalBackup, parseLocalBackup, restoreLocalBackup, summarizeLocalBackup,
  type LocalBackup, type RestoreMode,
} from '../adapters/storage/localBackup.ts';
import './backupRestorePanel.css';

type Props = { onRestored?: () => void };

export function BackupRestorePanel({ onRestored }: Props) {
  const [selected, setSelected] = useState<LocalBackup | null>(null);
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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
      setMessage('Sauvegarde téléchargée : ' + summary.recordCount + ' enregistrement(s) et ' + summary.settingCount + ' réglage(s).');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de sauvegarder les données.');
    } finally { setWorking(false); }
  }

  async function chooseFile(file?: File) {
    setSelected(null);
    setFileName('');
    setRestored(false);
    setError('');
    setMessage('');
    if (!file) return;
    setWorking(true);
    try {
      const backup = parseLocalBackup(await file.text());
      setSelected(backup);
      setFileName(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Fichier de sauvegarde invalide.');
      if (fileInput.current) fileInput.current.value = '';
    } finally { setWorking(false); }
  }

  async function importBackup() {
    if (!selected) return;
    if (mode === 'update' && !window.confirm(
      'Mettre à jour les données et réglages de même identifiant ? Les autres données resteront conservées.',
    )) return;
    setWorking(true);
    setError('');
    setMessage('');
    try {
      const result = await restoreLocalBackup(selected, mode);
      setRestored(true);
      const restoredRecords = mode === 'update'
        ? result.recordsUpdated + ' enregistrement(s) ajouté(s) ou mis à jour'
        : result.recordsImported + ' enregistrement(s) ajouté(s), ' + result.recordsPreserved + ' conflit(s) conservé(s)';
      setMessage(
        'Restauration terminée : ' + restoredRecords + '. '
        + result.settingsImported + ' réglage(s) importé(s) ou mis à jour, '
        + result.settingsPreserved + ' réglage(s) déjà présent(s) conservé(s). '
        + 'Rechargez l’application pour retrouver vos données.',
      );
      onRestored?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Échec de la restauration.');
    } finally { setWorking(false); }
  }

  const preview = selected ? summarizeLocalBackup(selected) : null;

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
      {preview && <div className="backup-restore-preview" role="status">
        <strong>{fileName}</strong>
        <span>Créée le {new Date(preview.createdAt).toLocaleString('fr-FR')} · {preview.recordCount} enregistrement(s) · {preview.settingCount} réglage(s)</span>
        <span>Copies, corrections, évaluations, radars, campagnes et configuration, selon les données effectivement enregistrées.</span>
      </div>}
      {preview && <p className="backup-restore-guidance">Sur une nouvelle PWA, cochez « Mettre à jour » pour reprendre aussi votre devoir par défaut et vos réglages IA de localhost. Les données absentes du fichier ne seront jamais supprimées.</p>}
      {preview && <label className="backup-restore-mode">
        <input type="checkbox" checked={mode === 'update'} disabled={working}
          onChange={(event) => setMode(event.target.checked ? 'update' : 'merge')} />
        Mettre à jour les éléments de même identifiant (sinon, conserver les données existantes)
      </label>}
      <div className="backup-restore-actions">
        <button type="button" className="secondary-button" disabled={!selected || working}
          onClick={() => void importBackup()}>{working ? 'Restauration…' : 'Restaurer la sauvegarde'}</button>
        {restored && <button type="button" className="secondary-button" onClick={() => window.location.reload()}>
          Recharger l’application
        </button>}
      </div>
      {error && <p role="alert" className="storage-usage-notice is-error">{error}</p>}
      {message && <p role="status" className="storage-usage-notice">{message}</p>}
      <small>Le fichier reste sur votre appareil. Il peut contenir les copies et les réglages de connexion : conservez-le dans un endroit sûr.</small>
    </div>
  </section>;
}
