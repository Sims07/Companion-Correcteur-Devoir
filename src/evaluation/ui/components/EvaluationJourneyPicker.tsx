export type EvaluationJourney = 'custom' | 'diagrams' | 'biology';

const journeys: { id: EvaluationJourney; title: string; description: string }[] = [
  { id: 'diagrams', title: 'Schémas scientifiques', description: 'Sens des flèches, structures, légendes et relations biologiques' },
  { id: 'biology', title: 'Biologie', description: 'Méthodes, répétabilité et parallélisme sur des cas de référence' },
  { id: 'custom', title: 'Ma copie', description: 'Tester une copie et un barème personnels' },
];

export function EvaluationJourneyPicker({ value, disabled, onChange }: {
  value: EvaluationJourney; disabled: boolean; onChange: (value: EvaluationJourney) => void;
}) {
  return <section className="evaluation-journey-picker" aria-label="Famille de tests">
    <div className="evaluation-journey-options" role="group" aria-label="Parcours de test">
      {journeys.map((journey) => <button key={journey.id} type="button" aria-pressed={value === journey.id}
        title={journey.description} disabled={disabled} onClick={() => onChange(journey.id)}>
        <strong>{journey.title}</strong>
      </button>)}
    </div>
  </section>;
}
