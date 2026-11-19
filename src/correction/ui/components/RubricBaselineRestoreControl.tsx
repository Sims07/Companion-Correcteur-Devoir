import { useState } from 'react';
import { rubricIsAtBaseline, restoreRubricBaseline } from '../../domain/rubricBaseline.ts';
import { loadBaseline, loadVersions } from './rubricVersionStorage.ts';
import type { Rubric } from '../../domain/rubric.ts';

interface Props {
  rubric: Rubric;
  assignmentId: string;
  disabled?: boolean;
  onRestore: (rubric: Rubric) => void;
}

/** The only restoration action lives in the teacher summary, never under an accordion. */
export function RubricBaselineRestoreControl({ rubric, assignmentId, disabled = false, onRestore }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState('');
  const versions = loadVersions(assignmentId);
  const baseline = loadBaseline(assignmentId, versions);
  const isAtBaseline = rubricIsAtBaseline(rubric, baseline);
  if (!versions.length || !baseline) return null;
  const isOriginal = baseline.source === 'initial';

  function confirm() {
    if (!baseline || disabled || isAtBaseline) return;
    try {
      onRestore(restoreRubricBaseline(baseline));
      setConfirming(false);
      setFeedback(isOriginal ? 'Barème initial restauré.' : 'Première version conservée restaurée.');
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Impossible de restaurer ce barème.');
    }
  }

  return <section className="atelier-rubric-restore" aria-label="Version du barème">
    <strong>Version du barème</strong>
    {isAtBaseline ? <p role="status">{isOriginal ? 'Barème initial utilisé.' : 'Première version conservée utilisée.'}</p> : <>
      <p>{isOriginal ? 'La version initiale est disponible.' : 'Une version précédente est disponible.'}</p>
      <button type="button" className="secondary-button atelier-rubric-restore-launch" disabled={disabled}
        onClick={() => { setConfirming((value) => !value); setFeedback(''); }}>
        {isOriginal ? 'Restaurer le barème initial' : 'Restaurer la première version conservée'}
      </button>
      {!isOriginal && <p className="atelier-rubric-restore-help">Sur cet ancien devoir, l’origine exacte n’est pas garantie.</p>}
      {confirming && <div className="atelier-rubric-restore-confirm" role="group" aria-label="Confirmer la restauration du barème">
        <strong>Remplacer le barème actuel ?</strong>
        <p>Les critères, descriptions, références et points actuels seront remplacés, y compris vos modifications manuelles. Les copies déjà corrigées et l’historique restent conservés.</p>
        <div className="atelier-rubric-restore-actions">
          <button type="button" className="primary-button" disabled={disabled} onClick={confirm}>Confirmer la restauration</button>
          <button type="button" className="text-button" onClick={() => setConfirming(false)}>Annuler</button>
        </div>
      </div>}
    </>}
    {feedback && <p role="status" className="atelier-rubric-restore-feedback">{feedback}</p>}
  </section>;
}
