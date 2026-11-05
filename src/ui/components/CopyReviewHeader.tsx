import type { ChangeEvent } from 'react';

export interface CopyReviewHeaderProps {
  studentLabel: string;
  onStudentLabelChange: (value: string) => void;
  position: number;
  totalCopies: number;
  status: 'En attente' | 'Analyse en cours' | 'À vérifier' | 'À reprendre' | 'Corrigée';
  score: number | null;
  scoreIncomplete?: boolean;
  maximumPoints: number;
  isFinalized: boolean;
  canPrevious: boolean;
  canNext: boolean;
  previousLabel?: string | null;
  nextLabel?: string | null;
  onPrevious: () => void;
  onNext: () => void;
}

export function CopyReviewHeader({
  studentLabel, onStudentLabelChange, position, totalCopies, status, score, scoreIncomplete = false, maximumPoints,
  isFinalized, canPrevious, canNext, previousLabel, nextLabel,
  onPrevious, onNext,
}: CopyReviewHeaderProps) {
  const previousTitle = previousLabel ? 'Copie précédente : ' + previousLabel : 'Aucune copie précédente';
  const nextTitle = nextLabel ? 'Copie suivante : ' + nextLabel : 'Aucune copie suivante';
  // A queued or running copy has no grade yet, even when a draft contains a zero.
  const gradeAvailable = score !== null && status !== 'En attente' && status !== 'Analyse en cours';
  const gradeLabel = status === 'Analyse en cours' ? 'Évaluation en cours' : status === 'À reprendre' ? 'Note indisponible' : 'Note à venir';
  return (
    <section className="copy-review-header" aria-label="Vérification de la copie">
      <div className="copy-review-header-main">
        <label className="copy-review-student-name">
          <span className="copy-review-student-caption">Nom lu sur la copie</span>
          <input id="student-label" aria-label="Nom de l’étudiant" value={studentLabel} onChange={(event: ChangeEvent<HTMLInputElement>) => onStudentLabelChange(event.target.value)} placeholder="Nom de l’étudiant" />
        </label>
        <div className="copy-review-position" aria-label={'Copie ' + position + ' sur ' + totalCopies}>
          <button type="button" aria-label="Copie précédente" title={previousTitle} disabled={!canPrevious} onClick={onPrevious}>←</button>
          <strong>Copie {position} sur {totalCopies}</strong>
          <button type="button" aria-label="Copie suivante" title={nextTitle} disabled={!canNext} onClick={onNext}>→</button>
        </div>
        <span className={'copy-review-status ' + (isFinalized ? 'is-completed' : 'needs-attention')}>{status}</span>
        <strong className="copy-review-header-score">{gradeAvailable ? <>{scoreIncomplete ? 'Note partielle : ' : ''}{score!.toLocaleString('fr-FR')} / {maximumPoints.toLocaleString('fr-FR')}</> : gradeLabel}</strong>
      </div>
    </section>
  );
}
