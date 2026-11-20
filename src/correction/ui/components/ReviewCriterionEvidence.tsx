import type { ReviewedCriterion } from '../../domain/grading.ts';
import type { SubcriterionTeacherDecision } from '../../domain/subcriterionReview.ts';
import { formatReviewPoints, reviewPointBalance } from '../../domain/reviewEvidencePresentation.ts';
import { Button } from '../../../shared/ui/design-system/index.ts';
import './ReviewCriterionEvidence.css';

interface Props {
  criterion: ReviewedCriterion;
  title: string;
  maximum: number;
  pageNumber?: number;
  onShowPage?: () => void;
  onResolveSubcriterion: (subcriterionId: string, action: SubcriterionTeacherDecision) => void;
  disabled?: boolean;
}

/** Teacher-facing evidence is visible without opening a nested disclosure. */
export function ReviewCriterionEvidence({
  criterion, title, maximum, pageNumber, onShowPage, onResolveSubcriterion, disabled = false,
}: Props) {
  const balance = reviewPointBalance(criterion.teacherPoints, maximum);
  const awaitingTeacher = criterion.assessmentStatus === 'not-evaluated';

  return <section className="review-evidence-spotlight" aria-label={`Preuves et points du critère ${title}`}>
    <div className="review-evidence-scoreline" aria-label="Répartition des points">
      <div className="review-evidence-awarded">
        <span>Points accordés{awaitingTeacher ? ' · à vérifier' : ''}</span>
        <strong>{formatReviewPoints(balance.awarded)} / {formatReviewPoints(maximum)}</strong>
      </div>
      <div className="review-evidence-removed">
        <span>Points retirés</span>
        <strong>{balance.removed > 0 ? '−' : ''}{formatReviewPoints(balance.removed)} pt</strong>
      </div>
    </div>

    {criterion.subcriteria && criterion.subcriteria.length > 0 && <div className="review-evidence-breakdown">
      <h4>Détail des points et des preuves</h4>
      <ul>
        {criterion.subcriteria.map((entry) => {
          const points = reviewPointBalance(entry.points, entry.maxPoints);
          const pending = entry.assessmentStatus === 'not-evaluated';
          return <li key={entry.subcriterionId} className={`review-evidence-item ${points.removed > 0 ? 'has-deduction' : 'is-credited'} ${pending ? 'is-pending' : ''}`}>
            <div className="review-evidence-item-head">
              <strong>{entry.title}</strong>
              <div className="review-evidence-item-points">
                <span className="review-evidence-item-awarded">{formatReviewPoints(points.awarded)} / {formatReviewPoints(entry.maxPoints)} pt</span>
                {points.removed > 0 && <span className="review-evidence-item-deduction">−{formatReviewPoints(points.removed)} pt</span>}
              </div>
            </div>
            <p>{entry.evidence.trim() || 'L’IA ne fournit pas de preuve pour ce sous-critère.'}</p>
            {pending && <div className="review-evidence-pending">
              <p><strong>À vérifier :</strong> {entry.questionForTeacher || 'Vérifiez cette décision directement sur la copie.'}</p>
              {!disabled && <div className="review-evidence-item-actions" role="group" aria-label={`Arbitrage du sous-critère ${entry.title}`}>
                <Button variant="secondary" onClick={() => onResolveSubcriterion(entry.subcriterionId, 'confirm')}>Confirmer {formatReviewPoints(entry.points)} pt</Button>
                {entry.points > 0 && <Button variant="secondary" onClick={() => onResolveSubcriterion(entry.subcriterionId, 'reject')}>Refuser · 0 pt</Button>}
              </div>}
            </div>}
            {entry.verificationSource === 'teacher' && <small className="review-evidence-verified">Vérifié par le professeur</small>}
          </li>;
        })}
      </ul>
    </div>}

    <div className="review-evidence-source">
      <h4>Éléments repérés sur la copie</h4>
      <p>{criterion.evidence.trim() || 'L’IA ne fournit pas de preuve générale. Vérifiez la copie avant de confirmer.'}</p>
      {pageNumber !== undefined && onShowPage && <button type="button" className="evidence-location-button" onClick={onShowPage}>Repérer sur la page {pageNumber}</button>}
    </div>
  </section>;
}
