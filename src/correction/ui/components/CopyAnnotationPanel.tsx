import type { ReactNode } from 'react';
import { MAX_COPY_ANNOTATION_LENGTH, type CopyAnnotation } from '../../domain/copyAnnotationFeature.ts';

export interface CopyAnnotationEdit {
  annotation: CopyAnnotation;
  selecting: boolean;
  saveOnPlacement: boolean;
}

export function CopyAnnotationPanel({
  annotations, criteria, edit, onEdit, onAdd, onSelect, onSave, onDelete, disabled, generation,
  enabled, toggle, listOpen, onListOpen, generationIssue,
}: {
  annotations: CopyAnnotation[];
  criteria: readonly { id: string; title: string }[];
  edit: CopyAnnotationEdit | null;
  onEdit: (edit: CopyAnnotationEdit | null) => void;
  onAdd: () => void;
  onSelect: (edit: CopyAnnotationEdit, page?: number) => void;
  onSave: (annotation: CopyAnnotation) => void;
  onDelete: (id: string) => void;
  disabled: boolean;
  generation?: ReactNode;
  enabled: boolean;
  toggle: ReactNode;
  listOpen: boolean;
  onListOpen: (open: boolean) => void;
  generationIssue?: string;
}) {
  return <section className="copy-annotation-panel copy-annotation-workspace" aria-label={enabled ? "Annotations de la copie" : undefined}>
    <div className="copy-annotation-toolbar">
      {toggle}
      {enabled && <>
        <div className="copy-annotation-toolbar-actions">
          <button type="button" className="secondary-button" disabled={disabled} onClick={onAdd}><span aria-hidden="true">＋</span> Ajouter</button>
          {generation}
          <button type="button" className="secondary-button copy-annotation-list-toggle" aria-expanded={listOpen && !edit} aria-controls="copy-annotation-list" onClick={() => onListOpen(!listOpen)}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>
            <span>Annotations ({annotations.length})</span>
          </button>
        </div>
      </>}
    </div>
    {enabled && <>
    {generationIssue && <small className="copy-annotation-generation-issue">{generationIssue}</small>}
    {edit?.selecting && <div className="copy-annotation-actions">
      <p className="copy-annotation-placement-help" role="status">Sélectionnez un emplacement sur une page.</p>
      <button type="button" className="text-button" onClick={() => onEdit({ annotation: { ...edit.annotation, placement: undefined }, selecting: false, saveOnPlacement: false })}>Sans emplacement</button>
      <button type="button" className="text-button" onClick={() => onEdit(null)}>Annuler</button>
    </div>}
    {edit && !edit.selecting && <form className="copy-annotation-editor" onSubmit={(event) => {
      event.preventDefault();
      if (edit.annotation.message.trim()) onSave(edit.annotation);
    }}>
      <label>Remarque<textarea autoFocus required maxLength={MAX_COPY_ANNOTATION_LENGTH} rows={2} value={edit.annotation.message}
        onChange={(event) => onEdit({ ...edit, annotation: { ...edit.annotation, message: event.target.value } })} /></label>
      <label>Critère associé <select value={edit.annotation.criterionId ?? ''} onChange={(event) => onEdit({
        ...edit, annotation: { ...edit.annotation, criterionId: event.target.value || undefined },
      })}>
        <option value="">Aucun critère</option>
        {criteria.map((criterion) => <option key={criterion.id} value={criterion.id}>{criterion.title}</option>)}
      </select></label>
      <div className="copy-annotation-actions">
        <button type="submit" className="primary-button" disabled={!edit.annotation.message.trim() || disabled}>Enregistrer</button>
        <button type="button" className="secondary-button" disabled={!edit.annotation.message.trim() || disabled}
          onClick={() => onSelect({ ...edit, selecting: true, saveOnPlacement: true }, edit.annotation.placement?.pageNumber)}>Placer sur la copie</button>
        <button type="button" className="text-button" onClick={() => onEdit(null)}>Annuler</button>
      </div>
    </form>}
    <div id="copy-annotation-list" hidden={!listOpen || Boolean(edit)}>
    {annotations.length === 0 ? <p className="copy-annotation-empty">Aucune annotation. Ajoutez une remarque ou générez des suggestions.</p> : <ol className="copy-annotation-list">
      {annotations.map((annotation, index) => <li key={annotation.id} id={`copy-annotation-${annotation.id}`} tabIndex={-1}>
        <div><strong>{index + 1}. {annotation.message}</strong></div>
        <small>{[criteria.find((criterion) => criterion.id === annotation.criterionId)?.title,
          annotation.placement ? `Page ${annotation.placement.pageNumber}` : 'Sans emplacement',
          annotation.status === 'suggested' ? 'Suggestion IA à valider' : undefined,
        ].filter(Boolean).join(' · ')}</small>
        <div className="copy-annotation-actions">
          {annotation.status === 'suggested' && <button type="button" className="secondary-button" disabled={disabled}
            onClick={() => onSave({ ...annotation, status: 'accepted' })}>Valider</button>}
          <button type="button" className="text-button" disabled={disabled}
            onClick={() => onSelect({ annotation, selecting: false, saveOnPlacement: false })}>Modifier</button>
          <button type="button" className="text-button" disabled={disabled}
            onClick={() => onSelect({ annotation, selecting: true, saveOnPlacement: true }, annotation.placement?.pageNumber)}>
            {annotation.placement ? 'Déplacer sur la copie' : 'Placer sur la copie'}
          </button>
          <button type="button" className="text-button" disabled={disabled} onClick={() => onDelete(annotation.id)}>Supprimer</button>
        </div>
      </li>)}
    </ol>}
    </div>
    </>}
  </section>;
}
