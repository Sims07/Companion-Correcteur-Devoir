import type { ReactNode } from 'react';
import { MAX_COPY_ANNOTATION_LENGTH, type CopyAnnotation } from '../../domain/copyAnnotationFeature.ts';

export interface CopyAnnotationEdit {
  annotation: CopyAnnotation;
  selecting: boolean;
  saveOnPlacement: boolean;
}

export function CopyAnnotationPanel({
  annotations, criteria, edit, onEdit, onAdd, onSelect, onSave, onDelete, disabled, generation,
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
}) {
  return <section className="copy-annotation-panel" aria-label="Annotations de la copie">
    <div className="copy-annotation-actions">
      <strong>Annotations ({annotations.length})</strong>
      <button type="button" className="secondary-button" disabled={disabled} onClick={onAdd}>Ajouter</button>
    </div>
    {generation}
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
    {annotations.length > 0 && <ol className="copy-annotation-list">
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
  </section>;
}
