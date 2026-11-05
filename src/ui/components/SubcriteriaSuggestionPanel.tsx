import { useState } from 'react';
import { appendSuggestedSubcriteria, normalizedSubcriterionTitle, suggestSubcriteriaFromDescription, type SuggestedSubcriterion } from '../../domain/rubricSubcriteriaSuggestion.ts';
import { getRubricSubcriteria, type RubricCriterion } from '../../domain/rubric.ts';
import { sumGradeScores } from '../../domain/scorePrecision.ts';
import { Button } from '../design-system/index.ts';
import './SubcriteriaSuggestionPanel.css';

interface Props {
  criterion: RubricCriterion;
  onApply: (patch: ReturnType<typeof appendSuggestedSubcriteria>) => void;
}

function signature(criterion: RubricCriterion): string {
  return JSON.stringify([criterion.description, criterion.maxPoints, getRubricSubcriteria(criterion)]);
}

/** A teacher-reviewed preview; no network request and no speculative point allocation. */
export function SubcriteriaSuggestionPanel({ criterion, onApply }: Props) {
  const [source, setSource] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<SuggestedSubcriterion[]>([]);
  const [message, setMessage] = useState('');
  const current = signature(criterion);
  const unchanged = source === current;
  const existing = getRubricSubcriteria(criterion);
  const total = sumGradeScores([...existing.map((item) => item.maxPoints), ...drafts.map((item) => item.maxPoints ?? 0)]);
  const titles = [...existing.map((item) => item.title), ...drafts.map((item) => item.title)]
    .map(normalizedSubcriterionTitle);
  const valid = unchanged && drafts.length > 0
    && drafts.every((item) => item.title.trim() && item.maxPoints !== null && Number.isFinite(item.maxPoints) && item.maxPoints >= 0)
    && titles.every(Boolean) && new Set(titles).size === titles.length
    && Math.abs(total - criterion.maxPoints) < 0.0001;

  function propose() {
    const suggestions = suggestSubcriteriaFromDescription(criterion);
    setSource(current);
    setDrafts(suggestions);
    setMessage(suggestions.length === 0
      ? 'Aucun nouvel attendu distinct trouvé. Séparez les éléments par un point-virgule ou un retour à la ligne.'
      : '');
  }

  function apply() {
    try {
      const patch = appendSuggestedSubcriteria(criterion, drafts, () => crypto.randomUUID());
      onApply(patch);
      setDrafts([]);
      setSource(null);
      setMessage('');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Impossible de créer ces sous-critères.');
    }
  }

  return <div className="rubric-subcriteria-suggestion">
    <Button variant="secondary" disabled={!criterion.description.trim()} onClick={propose}>Proposer des sous-critères depuis les attendus</Button>
    {unchanged && message && <p className="rubric-subcriteria-suggestion-feedback" role="status">{message}</p>}
    {unchanged && drafts.length > 0 && <section className="rubric-subcriteria-suggestion-preview" role="region" aria-label="Proposition de sous-critères">
      <div className="rubric-subcriteria-suggestion-heading"><strong>{drafts.length} sous-critère{drafts.length > 1 ? 's' : ''} proposé{drafts.length > 1 ? 's' : ''}</strong><span>À vérifier avant ajout</span></div>
      <p>Vérifiez les intitulés et les points. Les attendus d’origine et les sous-critères existants seront conservés.</p>
      <div className="rubric-subcriteria-suggestion-list">
        {drafts.map((draft, index) => <div className="rubric-subcriteria-suggestion-row" key={index}>
          <label><span className="field-label">Attendu {index + 1}</span><input value={draft.title} aria-label={`Intitulé proposé ${index + 1}`} onChange={(event) => setDrafts((items) => items.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} /></label>
          <label><span className="field-label">Points</span><input type="number" min="0" step="0.01" placeholder="À définir" aria-label={`Points proposés ${index + 1}`} value={draft.maxPoints ?? ''} onChange={(event) => setDrafts((items) => items.map((item, i) => i === index ? { ...item, maxPoints: event.target.value === '' ? null : Number(event.target.value) } : item))} /></label>
          <button type="button" className="icon-button" aria-label={`Écarter l’attendu ${index + 1}`} onClick={() => setDrafts((items) => items.filter((_, i) => i !== index))}>×</button>
        </div>)}
      </div>
      <p className={valid ? 'validation valid' : 'validation invalid'} role="status">
        Total après ajout : {total} / {criterion.maxPoints} points
        {drafts.some((item) => item.maxPoints === null) ? ' · Complétez les points non précisés.' : !valid ? ' · Vérifiez les intitulés et la répartition.' : ' · Prêt à ajouter.'}
      </p>
      <div className="rubric-subcriteria-suggestion-actions">
        <Button disabled={!valid} onClick={apply}>Ajouter {drafts.length} sous-critère{drafts.length > 1 ? 's' : ''}</Button>
        <Button variant="secondary" onClick={() => { setSource(null); setDrafts([]); setMessage(''); }}>Annuler</Button>
      </div>
    </section>}
  </div>;
}
