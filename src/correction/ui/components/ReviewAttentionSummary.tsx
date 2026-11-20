import { Button } from '../../../shared/ui/design-system/components/Button.tsx';

interface Props {
  flaggedCriteriaCount: number;
  reliableCriteriaCount: number;
  readingNeedsReview: boolean;
  showOnlyFlagged: boolean;
  onShowOnlyFlaggedChange: (showOnlyFlagged: boolean) => void;
}

/** One actionable summary, rather than a counter, a warning banner and a separate filter row. */
export function ReviewAttentionSummary({
  flaggedCriteriaCount, reliableCriteriaCount, readingNeedsReview,
  showOnlyFlagged, onShowOnlyFlaggedChange,
}: Props) {
  return <div className="atelier-review-decision-heading" aria-label="Bilan des critères">
    <div className="atelier-review-decision-status">
      <strong>{flaggedCriteriaCount > 0
        ? `${flaggedCriteriaCount} critère${flaggedCriteriaCount > 1 ? 's' : ''} à vérifier sur la copie`
        : 'Proposition de correction'}</strong>
      {reliableCriteriaCount > 0 && <span>${reliableCriteriaCount} autre${reliableCriteriaCount > 1 ? 's' : ''} critère${reliableCriteriaCount > 1 ? 's' : ''} sans alerte</span>}
      {readingNeedsReview && <span className="atelier-review-reading-warning" role="status">Lecture à vérifier sur l’image</span>}
    </div>
    {flaggedCriteriaCount > 0 && <Button
      variant="secondary"
      className="review-criteria-filter"
      aria-pressed={showOnlyFlagged}
      onClick={() => onShowOnlyFlaggedChange(!showOnlyFlagged)}
    >{showOnlyFlagged ? 'Voir tous les critères' : 'Voir uniquement à vérifier'}</Button>}
  </div>;
}
