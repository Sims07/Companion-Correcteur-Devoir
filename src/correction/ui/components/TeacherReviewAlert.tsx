import { useState } from 'react';
import { getTeacherReviewCue, usefulTeacherRationale } from '../../domain/teacherReviewCue.ts';
import { summarizeTeacherReason } from '../../domain/teacherReviewSummary.ts';
import './TeacherReviewAlert.css';

interface Props {
  reasons: string[];
  rationale: string;
  evidence?: string;
  questionForTeacher?: string | null;
  hasPendingSubcriteria?: boolean;
  annotationSuggestion?: string | null;
  pageNumber?: number;
  onShowEvidence?: () => void;
}

export function TeacherReviewAlert({
  reasons, rationale, evidence, questionForTeacher, hasPendingSubcriteria,
  annotationSuggestion, pageNumber, onShowEvidence,
}: Props) {
  const [copyMessage, setCopyMessage] = useState('');
  const cue = getTeacherReviewCue({ reasons, questionForTeacher, hasPendingSubcriteria });
  const explanation = usefulTeacherRationale(rationale, evidence, questionForTeacher ?? '');

  async function copyComment() {
    if (!annotationSuggestion) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard not available');
      await navigator.clipboard.writeText(annotationSuggestion);
      setCopyMessage('Commentaire copié');
    } catch {
      setCopyMessage('Copie indisponible dans ce navigateur.');
    }
  }

  if (!cue && !explanation && !annotationSuggestion && !(pageNumber !== undefined && onShowEvidence)) return null;

  return <section className="teacher-review-alert" aria-label="Vérification du critère">
    {cue && <div className="teacher-review-attention">
      <strong>{cue.title}</strong>
      <p>{cue.message}</p>
    </div>}
    {explanation && <p className="teacher-review-explanation"><strong>Explication de l’IA :</strong> {summarizeTeacherReason(explanation)}</p>}
    {(pageNumber !== undefined && onShowEvidence || annotationSuggestion) && <div className="teacher-review-alert-actions">
      {pageNumber !== undefined && onShowEvidence && <button type="button" className="text-button" onClick={onShowEvidence}>Voir la page {pageNumber}</button>}
      {annotationSuggestion && <button type="button" className="text-button" onClick={() => { void copyComment(); }}>Copier le commentaire</button>}
      {copyMessage && <span role="status" className="teacher-review-copy-status">{copyMessage}</span>}
    </div>}
  </section>;
}
