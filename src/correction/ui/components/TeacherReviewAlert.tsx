import { useState } from 'react';
import { summarizeTeacherReason } from '../../domain/teacherReviewSummary.ts';
import './TeacherReviewAlert.css';

interface Props {
  reasons: string[];
  rationale: string;
  questionForTeacher?: string | null;
  annotationSuggestion?: string | null;
  pageNumber?: number;
  onShowEvidence?: () => void;
}

export function TeacherReviewAlert({ reasons, rationale, questionForTeacher, annotationSuggestion, pageNumber, onShowEvidence }: Props) {
  const [copyMessage, setCopyMessage] = useState('');

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

  return <div className="review-alert-summary teacher-review-alert">
    <div className="review-alert-reasons">{reasons.map((reason) => <span className="review-alert-reason" key={reason}>{reason}</span>)}</div>
    <p className="rationale">{summarizeTeacherReason(rationale)}</p>
    {questionForTeacher && <p className="teacher-question"><strong>Question pour vous :</strong> {summarizeTeacherReason(questionForTeacher, 20)}</p>}
    {(pageNumber !== undefined && onShowEvidence || annotationSuggestion) && <div className="teacher-review-alert-actions">
      {pageNumber !== undefined && onShowEvidence && <button type="button" className="text-button" onClick={onShowEvidence}>Voir la page {pageNumber}</button>}
      {annotationSuggestion && <button type="button" className="text-button" onClick={() => { void copyComment(); }}>Copier le commentaire</button>}
      {copyMessage && <span role="status" className="teacher-review-copy-status">{copyMessage}</span>}
    </div>}
  </div>;
}
