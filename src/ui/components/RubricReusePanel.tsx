import { useState } from 'react';
import { previewReusableCriteria, reuseSelectedCriteria } from '../../domain/teacherWorkflow.ts';
import { validateRubric, type Rubric, type RubricCriterion } from '../../domain/rubric.ts';
import { DesignSystemSelect } from './DesignSystemSelect.tsx';
import { Button } from '../design-system/index.ts';

interface RubricSource {
  id: string;
  title: string;
  rubric: Rubric;
}
interface Props {
  assignments: RubricSource[];
  activeAssignmentId: string;
  rubric: Rubric;
  onReuse: (criteria: RubricCriterion[]) => void;
}

export function RubricReusePanel({ assignments, activeAssignmentId, rubric, onReuse }: Props) {
  const candidates = assignments.filter((assignment) => assignment.id !== activeAssignmentId && validateRubric(assignment.rubric).valid);
  const [sourceId, setSourceId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const source = candidates.find((assignment) => assignment.id === sourceId) ?? candidates[0];
  const items = source ? previewReusableCriteria(source.rubric, rubric) : [];
  const selection = selectedIds.filter((id) => items.some((item) => item.criterion.id === id && item.status !== 'duplicate'));

  function reuse() {
    if (!source || !selection.length) return;
    try {
      const criteria = reuseSelectedCriteria(source.rubric, rubric, selection, (kind) => kind + '-' + crypto.randomUUID());
      onReuse(criteria);
      setSelectedIds([]);
      setError('');
      setMessage(criteria.length + ' critère(s) ajouté(s) au barème. Le devoir d’origine reste inchangé.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de réutiliser ces critères.');
    }
  }

  return <details className="rubric-reuse-panel">
    <summary>↳ Réutiliser des critères d’un autre devoir</summary>
    <div className="rubric-reuse-content">
      <p>Récupérez directement les critères déjà préparés sur cet appareil, sans exporter de fichier. Ils deviennent indépendants du devoir d’origine.</p>
      {!source ? <p className="rubric-reuse-empty">Aucun autre barème complet n’est disponible. Vous pourrez réutiliser les critères après avoir préparé un autre devoir.</p> : <>
        <label className="field-label" htmlFor="rubric-reuse-source">Devoir source</label>
        <DesignSystemSelect id="rubric-reuse-source" value={source.id} onChange={(event) => { setSourceId(event.target.value); setSelectedIds([]); setError(''); setMessage(''); }}>
          {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title || 'Devoir sans titre'} · {candidate.rubric.criteria.length} critères</option>)}
        </DesignSystemSelect>
        <div className="rubric-reuse-list" aria-label="Critères disponibles">
          {items.map(({ criterion, status }) => <label className="rubric-reuse-item" key={criterion.id}>
            <input type="checkbox" checked={selection.includes(criterion.id)} disabled={status === 'duplicate'} onChange={(event) => { setSelectedIds((ids) => event.target.checked ? [...ids, criterion.id] : ids.filter((id) => id !== criterion.id)); setError(''); setMessage(''); }} />
            <span><strong>{criterion.title}</strong><small>{criterion.maxPoints} points · {criterion.subcriteria?.length ?? 0} sous-critère(s)</small></span>
            {status === 'duplicate' && <small>Déjà présent</small>}
            {status === 'title-conflict' && <small>Même intitulé</small>}
          </label>)}
        </div>
        {items.some((item) => item.status === 'title-conflict') && <p className="rubric-reuse-note">Les intitulés identiques mais différents restent sélectionnables : vérifiez-les après l’ajout.</p>}
        {error && <p role="alert" className="validation invalid">{error}</p>}
        {message && <p role="status" className="validation valid">{message}</p>}
        <div className="rubric-reuse-actions">
          <span>{selection.length} sélectionné(s)</span>
          <Button disabled={selection.length === 0} onClick={reuse}>Ajouter au barème</Button>
        </div>
      </>}
    </div>
  </details>;
}
