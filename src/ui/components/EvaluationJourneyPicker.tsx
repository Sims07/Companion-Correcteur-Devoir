export type EvaluationJourney = 'custom' | 'diagrams' | 'biology';
const journeys: { id: EvaluationJourney; title: string; description: string; hint: string }[] = [
  { id: 'diagrams', title: 'Schémas scientifiques', description: 'Tester la correction visuelle et les légendes mal placées.', hint: 'Images et barèmes intégrés · export JSON' },
  { id: 'biology', title: 'Protocoles de biologie', description: 'Comparer les méthodes, vérifier la répétabilité et mesurer le parallélisme.', hint: 'Cas de référence · tests en un clic' },
  { id: 'custom', title: 'Ma propre copie', description: 'Comparer la vision, la notation ou le parcours complet sur vos documents.', hint: 'Votre copie et votre barème' },
];
export function EvaluationJourneyPicker({ value, disabled, onChange }: {
  value: EvaluationJourney; disabled: boolean; onChange: (value: EvaluationJourney) => void;
}) {
  return <section className="evaluation-journey-picker" aria-labelledby="evaluation-journey-title">
    <h2 id="evaluation-journey-title">Que voulez-vous tester ?</h2>
    <p>Un seul parcours s’affiche à la fois. Vos configurations sont communes aux trois parcours.</p>
    <div className="evaluation-journey-options" role="group" aria-label="Parcours de test">
      {journeys.map((journey) => <button key={journey.id} type="button" aria-pressed={value === journey.id}
        disabled={disabled} onClick={() => onChange(journey.id)}>
        <strong>{journey.title}</strong><span>{journey.description}</span><small>{journey.hint}</small>
      </button>)}
    </div>
  </section>;
}
