import type { ChangeEvent } from 'react';

export interface CopyReviewHeaderProps {
  studentLabel: string;
  onStudentLabelChange: (value: string) => void;
  position: number;
  totalCopies: number;
  status: 'En attente' | 'Analyse en cours' | 'À vérifier' | 'À reprendre' | 'Corrigée';
  score: number;
  maximumPoints: number;
  isAnalyzing: boolean;
  isFinalized: boolean;
  canValidate: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onValidate: () => void;
}

export function CopyReviewHeader({
  studentLabel, onStudentLabelChange, position, totalCopies, status, score, maximumPoints,
  isAnalyzing, isFinalized, canValidate, onPrevious, onNext, onValidate,
}: CopyReviewHeaderProps) {
  return (
    <section className="copy-review-header" aria-label="Vérification de la copie">
      <div className="copy-review-header-main">
        <label className="copy-review-student-name">
          <span className="copy-review-student-caption">Nom lu sur la copie</span>
          <input id="student-label" aria-label="Nom de l’étudiant" value={studentLabel} onChange={(event: ChangeEvent<HTMLInputElement>) => onStudentLabelChange(event.target.value)} placeholder="Nom de l’étudiant" />
        </label>
        <div className="copy-review-position" aria-label={`Copie ${position} sur ${totalCopies}`}>
          <button type="button" aria-label="Copie précédente" disabled={position <= 1 || isAnalyzing} onClick={onPrevious}>←</button>
          <strong>{position}/{totalCopies}</strong>
          <button type="button" aria-label="Copie suivante" disabled={position >= totalCopies || isAnalyzing} onClick={onNext}>→</button>
        </div>
        <span className={`copy-review-status ${isFinalized ? 'is-completed' : 'needs-attention'}`}>{status}</span>
        <strong className="copy-review-header-score">{score.toLocaleString('fr-FR')} / {maximumPoints}</strong>
        <button type="button" className="primary-button" aria-keyshortcuts="Control+Enter Meta+Enter" disabled={isAnalyzing || isFinalized || !canValidate} onClick={onValidate}>{isFinalized ? 'Correction validée' : 'Valider et passer à la suivante'}</button>
      </div>
    </section>
  );
}
