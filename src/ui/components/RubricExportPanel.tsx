import { useEffect, useState } from 'react';
import { createRubricExport } from '../../domain/rubricExport.ts';
import type { Rubric } from '../../domain/rubric.ts';
import './RubricExportPanel.css';
interface RubricExportPanelProps { rubric: Rubric }
function fileName(value: string): string {
 const slug = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
 return `${slug || 'bareme'}-criteres.json`;
}
export function RubricExportPanel({ rubric }: RubricExportPanelProps) {
 const [selectedIds, setSelectedIds] = useState<string[]>(() => rubric.criteria.map((criterion) => criterion.id));
 const [message, setMessage] = useState('');
 const criteriaKey = rubric.criteria.map((criterion) => criterion.id).join('|');
 useEffect(() => { setSelectedIds(rubric.criteria.map((criterion) => criterion.id)); }, [criteriaKey]);
 const allSelected = rubric.criteria.length > 0 && rubric.criteria.every((criterion) => selectedIds.includes(criterion.id));
 function exportSelection() {
  try {
   const payload = createRubricExport(rubric, selectedIds);
   const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
   const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
   anchor.href = url; anchor.download = fileName(rubric.title); anchor.click(); URL.revokeObjectURL(url);
   setMessage(`${payload.criteria.length} critère(s) exporté(s).`);
  } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Impossible de préparer cet export.'); }
 }
 if (!rubric.criteria.length) return null;
 return <details className="rubric-export-panel"><summary>Exporter des critères</summary><div className="rubric-export-content">
  <p>Sélectionnez les critères à réutiliser dans un autre devoir. Le fichier conserve leurs points et sous-critères.</p>
  <label className="rubric-export-choice rubric-export-select-all"><input type="checkbox" checked={allSelected} onChange={(event) => setSelectedIds(event.target.checked ? rubric.criteria.map((criterion) => criterion.id) : [])} /><strong>Tout sélectionner</strong></label>
  <div className="rubric-export-criteria">{rubric.criteria.map((criterion) => <label className="rubric-export-choice" key={criterion.id}>
   <input type="checkbox" checked={selectedIds.includes(criterion.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, criterion.id] : current.filter((id) => id !== criterion.id))} />
   <span><strong>{criterion.title || 'Critère sans titre'}</strong><small>{criterion.maxPoints} point(s) · {criterion.subcriteria?.length ?? criterion.expectedElements?.length ?? 0} sous-critère(s)</small></span>
  </label>)}</div>
  <div className="rubric-export-footer"><span>{selectedIds.filter((id) => rubric.criteria.some((criterion) => criterion.id === id)).length} sélectionné(s)</span><button type="button" className="secondary-button" disabled={!selectedIds.length} onClick={exportSelection}>Télécharger le JSON</button></div>
  {message && <p className="rubric-export-message" role="status">{message}</p>}
 </div></details>;
}
