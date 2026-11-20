import { useState } from 'react';
import { getRubricSubcriteria, type Rubric } from '../../domain/rubric.ts';
import { Button, Dialog } from '../../../shared/ui/design-system/index.ts';
import './DiagramRubricQuickAccess.css';

interface Props {
  rubric: Rubric;
  maximumPoints: number;
  onEdit: () => void;
  editDisabled?: boolean;
  issue?: string | null;
}

/** One-line read-only access while reviewing copies. Editing remains in the rubric workspace. */
export function DiagramRubricQuickAccess({
  rubric, maximumPoints, onEdit, editDisabled = false, issue,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const points = (value: number) => value.toLocaleString('fr-FR');

  return <section className="diagram-rubric-quick-access" aria-label="Barème du schéma scientifique">
    <div className="diagram-rubric-quick-heading">
      <span aria-hidden="true" className="diagram-rubric-quick-icon">▤</span>
      <strong>Barème · Schéma scientifique</strong>
      <span className="diagram-rubric-quick-points">{points(maximumPoints)} points</span>
    </div>
    <div className="diagram-rubric-quick-actions">
      <Button variant="secondary" aria-haspopup="dialog" onClick={() => setIsOpen(true)}>Consulter</Button>
      <Button variant="secondary" onClick={onEdit} disabled={editDisabled}>Modifier le barème</Button>
    </div>
    {issue && <p role="status" className="diagram-rubric-quick-issue">{issue}</p>}
    {isOpen && <Dialog
      title="Consulter le barème"
      subtitle={rubric.title + ' · ' + points(maximumPoints) + ' points'}
      size="wide"
      onClose={() => setIsOpen(false)}
      actions={<Button variant="secondary" onClick={() => { setIsOpen(false); onEdit(); }} disabled={editDisabled}>Modifier dans Barème et consignes</Button>}
    >
      <p className="diagram-rubric-readonly-caption">Consultation en lecture seule : aucun critère ni aucune note ne sont modifiés ici.</p>
      <ol className="diagram-rubric-quick-criteria">
        {rubric.criteria.map((criterion) => <li key={criterion.id}>
          <div className="diagram-rubric-quick-criterion-heading">
            <strong>{criterion.title}</strong>
            <span>{points(criterion.maxPoints)} pt</span>
          </div>
          {criterion.description && <p>{criterion.description}</p>}
          {criterion.scientificExpectations?.length ? <ul className="diagram-rubric-quick-expectations">
            {criterion.scientificExpectations.map((expectation, index) => <li key={index}>{expectation}</li>)}
          </ul> : null}
          {getRubricSubcriteria(criterion).length > 0 && <ul className="diagram-rubric-quick-subcriteria">
            {getRubricSubcriteria(criterion).map((sub) => <li key={sub.id}>
              <span><strong>{sub.title}</strong>{sub.description && <small>{sub.description}</small>}</span>
              <span>{points(sub.maxPoints)} pt</span>
            </li>)}
          </ul>}
        </li>)}
      </ol>
    </Dialog>}
  </section>;
}
