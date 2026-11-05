import { useState } from 'react';
import { FilePicker } from './FilePicker.tsx';
import { StatusNotice, type StatusTone } from '../design-system/index.ts';
import { previewRubricImport, resolveRubricImport, type RubricImportPreview } from '../../domain/rubricImport.ts';
import type { Rubric, RubricCriterion } from '../../domain/rubric.ts';
import './RubricImportPanel.css';

interface RubricImportPanelProps { rubric: Rubric; onImport: (criteria: RubricCriterion[]) => void }
const statusLabels = { new: 'Nouveau critère', duplicate: 'Déjà présent · identique', 'id-conflict': 'Identifiant déjà utilisé', 'title-conflict': 'Intitulé déjà présent' } as const;

export function RubricImportPanel({ rubric, onImport }: RubricImportPanelProps) {
 const [preview, setPreview] = useState<RubricImportPreview | null>(null);
 const [selectedIds, setSelectedIds] = useState<string[]>([]);
 const [error, setError] = useState('');
 const [message, setMessage] = useState('');
 const [messageTone, setMessageTone] = useState<StatusTone>('info');
 const [reading, setReading] = useState(false);
 async function readFile(file: File | undefined) {
  if (!file) return;
  setReading(true); setError(''); setMessage(''); setPreview(null); setSelectedIds([]);
  try {
   const parsed: unknown = JSON.parse(await file.text());
   const next = previewRubricImport(parsed, rubric);
   setPreview(next);
   setSelectedIds(next.items.filter((item) => item.status === 'new').map((item) => item.criterion.id));
   const conflicts = next.items.filter((item) => item.status === 'id-conflict' || item.status === 'title-conflict').length;
   const duplicates = next.items.filter((item) => item.status === 'duplicate').length;
   setMessageTone(conflicts ? 'warning' : 'info');
   setMessage(`${next.items.filter((item) => item.status === 'new').length} nouveau(x) · ${conflicts} conflit(s) · ${duplicates} doublon(s) exact(s).`);
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible de lire ce fichier JSON.'); }
  finally { setReading(false); }
 }
 function applyImport() {
  if (!preview || selectedIds.length === 0) return;
  try {
   const criteria = resolveRubricImport(preview, selectedIds, (kind) => `${kind}-${crypto.randomUUID()}`);
   onImport(criteria);
   setMessageTone('success');
   setMessage(`${criteria.length} critère(s) ajouté(s) au barème. Les critères existants ont été conservés.`);
   setPreview(null); setSelectedIds([]);
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible d’ajouter ces critères.'); }
 }
 return <details className="rubric-import-panel"><summary>Importer des critères</summary><div className="rubric-import-content">
  <p>Ajoutez des critères depuis un export Companion Correcteur. Le contenu du barème actuel ne sera jamais remplacé.</p>
  <FilePicker id="rubric-criteria-import-file" accept=".json,application/json" title="Choisir un export de critères JSON" description={reading ? 'Lecture du fichier…' : 'Fichier JSON versionné · traitement local'} actionLabel={reading ? 'Lecture…' : 'Parcourir'} disabled={reading} compact onFilesSelected={(files) => { void readFile(files?.[0]); }} />
  {error && <StatusNotice tone="error">{error}</StatusNotice>}
  {message && <StatusNotice tone={messageTone}>{message}</StatusNotice>}
  {preview && <section className="rubric-import-preview" aria-label="Aperçu des critères à importer">
   <div className="rubric-import-preview-heading"><div><strong>Aperçu avant ajout</strong><small>Source : {preview.sourceTitle}</small></div><span>{preview.items.length} critère(s)</span></div>
   <div className="rubric-import-preview-list">{preview.items.map(({ criterion, status }) => <label className={`rubric-import-preview-item is-${status}`} key={criterion.id}>
    <input type="checkbox" checked={selectedIds.includes(criterion.id)} disabled={status === 'duplicate'} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, criterion.id] : current.filter((id) => id !== criterion.id))} />
    <span className="rubric-import-preview-copy"><strong>{criterion.title}</strong><small>{criterion.maxPoints} point(s) · {criterion.subcriteria?.length ?? 0} sous-critère(s)</small></span>
    <span className="rubric-import-status">{statusLabels[status]}</span>
   </label>)}</div>
   <p className="rubric-import-hint">Les doublons exacts sont ignorés. En cas de conflit d’identifiant, le critère importé reçoit un nouvel identifiant. Les conflits de titre restent à votre appréciation.</p>
   <div className="rubric-import-actions"><span>{selectedIds.length} sélectionné(s)</span><button type="button" className="secondary-button" disabled={!selectedIds.length} onClick={applyImport}>Ajouter la sélection</button></div>
  </section>}
 </div></details>;
}
