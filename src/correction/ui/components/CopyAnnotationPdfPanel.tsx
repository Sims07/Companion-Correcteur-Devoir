import { useRef, useState } from 'react';
import { Dialog } from '../../../shared/ui/design-system/components/Dialog.tsx';
import { CopyActionIcon } from './CopyActionIcon.tsx';
import type { CopyAnnotationPdfInput } from '../../ports/correctionWorkspace.ts';

export function CopyAnnotationPdfPanel({ copy, createPdf }: { copy: Omit<CopyAnnotationPdfInput, 'appreciation'>; createPdf: (input: CopyAnnotationPdfInput) => Promise<Blob> }) {
  const [open, setOpen] = useState(false);
  const [appreciation, setAppreciation] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const exporting = useRef(false);
  const pending = copy.annotations.filter((entry) => entry.status === 'suggested').length;

  async function download() {
    if (exporting.current) return;
    exporting.current = true;
    setStatus('running');
    try {
      const url = URL.createObjectURL(await createPdf({ ...copy, appreciation }));
      const link = document.createElement('a');
      link.href = url;
      const label = (copy.studentLabel.trim() || 'copie').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').slice(0, 100);
      link.download = `${label}-corrigee.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setStatus('done');
    } catch {
      setStatus('error');
    } finally {
      exporting.current = false;
    }
  }

  return <>
    <button type="button" className="secondary-button copy-annotation-export-button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Exporter la copie annotée">
      <CopyActionIcon name="download" /> PDF
    </button>
    {open && <Dialog title="Exporter la copie annotée" className="copy-annotation-export-dialog"
      subtitle="Préparez le document à remettre à l’étudiant." onClose={() => setOpen(false)}
      actions={<><button type="button" className="secondary-button" onClick={() => setOpen(false)}>Fermer</button>
        <button type="button" className="primary-button" disabled={status === 'running'} onClick={() => { void download(); }}>
          {status === 'running' ? 'Préparation du PDF…' : 'Télécharger le PDF'}
        </button></>}>
    <div className="copy-annotation-export-content">
    <label className="copy-annotation-editor">
      Appréciation générale
      <textarea rows={3} maxLength={3000} value={appreciation} onChange={(event) => setAppreciation(event.target.value)}
        placeholder="Écrivez votre appréciation pour l’étudiant" />
    </label>
    {pending > 0 && <small>Le PDF contient uniquement les annotations validées.</small>}
    {status === 'running' && <p role="status">Création du PDF sur cet appareil.</p>}
    {status === 'done' && <p role="status">Téléchargement du PDF lancé.</p>}
    {status === 'error' && <p role="alert">Impossible de créer le PDF. Vérifiez les images et réessayez.</p>}
    </div>
    </Dialog>}
  </>;
}
