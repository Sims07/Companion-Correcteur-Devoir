import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../design-system/components/Button.tsx';
import { TextInput } from '../design-system/components/TextInput.tsx';

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

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none">
    <path d={direction === 'left' ? 'm12 4-6 6 6 6' : 'm8 4 6 6-6 6'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function CopyReviewHeader({
  studentLabel, onStudentLabelChange, position, totalCopies, status, score, scoreIncomplete = false, maximumPoints,
  isFinalized, canPrevious, canNext, previousLabel, nextLabel,
  onPrevious, onNext,
}: CopyReviewHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(studentLabel);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const previousTitle = previousLabel ? 'Copie précédente : ' + previousLabel : 'Aucune copie précédente';
  const nextTitle = nextLabel ? 'Copie suivante : ' + nextLabel : 'Aucune copie suivante';
  // Queued/running copies are not graded, even if a draft score is zero.
  const gradeAvailable = score !== null && status !== 'En attente' && status !== 'Analyse en cours';
  const gradeLabel = status === 'Analyse en cours' ? 'Évaluation en cours' : status === 'À reprendre' ? 'Note indisponible' : 'Note à venir';
  const gradeCaption = isFinalized ? 'Note enregistrée' : scoreIncomplete ? 'Note partielle · à vérifier' : 'Note proposée';

  useEffect(() => {
    if (isEditing) nameInputRef.current?.focus();
  }, [isEditing]);

  // Reset an unfinished edit when navigating to a different copy.
  useEffect(() => {
    setIsEditing(false);
    setDraftName(studentLabel);
  }, [position]);

  const saveName = () => {
    const nextName = draftName.trim();
    if (nextName !== studentLabel) onStudentLabelChange(nextName);
    setIsEditing(false);
  };
  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveName();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraftName(studentLabel);
      setIsEditing(false);
    }
  };

  return (
    <section className="copy-review-header" aria-label="Vérification de la copie">
      <div className="copy-review-header-main">
        <div className="copy-review-student-name">
          <span className="copy-review-student-caption">Copie de l’étudiant</span>
          <div className="copy-review-identity-title">
            {isEditing ? (
              <TextInput id="student-label" ref={nameInputRef} className="copy-review-name-input"
                aria-label="Nom de l’étudiant" value={draftName} placeholder="Étudiant à identifier"
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={saveName} onKeyDown={handleNameKeyDown} />
            ) : (
              <>
                <h2 title={studentLabel || 'Étudiant à identifier'}>{studentLabel.trim() || 'Étudiant à identifier'}</h2>
                <Button variant="secondary" className="copy-review-edit-button" aria-label="Modifier le nom de l’étudiant"
                  title="Modifier le nom de l’étudiant" onClick={() => { setDraftName(studentLabel); setIsEditing(true); }}>
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">
                    <path d="m4 13.5-.5 3 3-.5L15.5 7a2 2 0 0 0-2.5-2.5L4 13.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="m11.5 6 2.5 2.5" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  Modifier
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="copy-review-grade" aria-label="Note de la copie">
          <span className="copy-review-grade-caption">{gradeAvailable ? gradeCaption : 'Évaluation'}</span>
          <strong className="copy-review-header-score">{gradeAvailable
            ? `${score!.toLocaleString('fr-FR')} / ${maximumPoints.toLocaleString('fr-FR')}`
            : gradeLabel}</strong>
        </div>
      </div>
      <div className="copy-review-header-footer">
        <span className={'copy-review-status ' + (isFinalized ? 'is-completed' : 'needs-attention')}>{status}</span>
        <nav className="copy-review-position" aria-label="Parcourir les copies">
          <Button variant="secondary" aria-label="Copie précédente" title={previousTitle} disabled={!canPrevious} onClick={onPrevious}>
            <Chevron direction="left" /><span>Précédente</span>
          </Button>
          <strong>Copie {position} sur {totalCopies}</strong>
          <Button variant="secondary" aria-label="Copie suivante" title={nextTitle} disabled={!canNext} onClick={onNext}>
            <span>Suivante</span><Chevron direction="right" />
          </Button>
        </nav>
      </div>
    </section>
  );
}
