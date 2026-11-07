import type { RubricCriterion } from '../../domain/rubric.ts';
import { questionAnswer, type CorrectionContract } from '../../domain/questionContract.ts';
import { DesignSystemSelect } from './DesignSystemSelect.tsx';

const empty: CorrectionContract = { expectedRelation: '', acceptedAlternatives: '', contradictions: '' };
export function QuestionContractEditor({ criterion, onChange }: { criterion: RubricCriterion; onChange: (patch: Partial<RubricCriterion>) => void }) {
  const contract = criterion.correctionContract;
  const patch = (value: Partial<CorrectionContract>) => onChange({ correctionContract: { ...empty, ...contract, ...value } });
  return <section aria-label={`Contrat de correction — ${criterion.title}`} className="subcriteria-editor">
    <label><input type="checkbox" checked={Boolean(contract)} disabled={criterion.analysisMode === 'scientific-diagram'} onChange={event => onChange({ correctionContract: event.target.checked ? { ...empty } : undefined })} /> Variante B — question et contrat de correction</label>
    {contract && <>
      <p className="hint">Préparez ce contrat une fois pour le devoir. Les sous-critères et leurs points restent les unités de notation. Désactiver cette option retire le contrat ; exportez le barème pour conserver votre variante B avant une comparaison.</p>
      <label><span className="field-label">Portée du critère</span><DesignSystemSelect value={contract.question ? 'question' : 'copy'} onChange={event => patch({ question: event.target.value === 'question' ? { id: '', instruction: '' } : undefined })}><option value="copy">Toute la copie (critère transversal)</option><option value="question">Une question précise</option></DesignSystemSelect></label>
      {contract.question && <div className="criterion-fields">
        <label><span className="field-label">Numéro de question</span><input value={contract.question.id} placeholder="1, 2a, 1.2…" onChange={event => patch({ question: { ...contract.question!, id: event.target.value.trim() } })} /></label>
        <label><span className="field-label">Consigne de cette question</span><textarea rows={2} value={contract.question.instruction} onChange={event => patch({ question: { ...contract.question!, instruction: event.target.value } })} /></label>
      </div>}
      <label><span className="field-label">Relation ou raisonnement attendu</span><textarea rows={2} value={contract.expectedRelation} onChange={event => patch({ expectedRelation: event.target.value })} placeholder="Décrivez la relation complète et les combinaisons ET / OU exigées par le barème." /></label>
      <label><span className="field-label">Formulations équivalentes acceptées</span><textarea rows={2} value={contract.acceptedAlternatives} onChange={event => patch({ acceptedAlternatives: event.target.value })} /></label>
      <label><span className="field-label">Contradictions à distinguer d’une omission</span><textarea rows={2} value={contract.contradictions} onChange={event => patch({ contradictions: event.target.value })} /></label>
      <p className="hint">Pour une question précise, vérifiez les repères « Question 1 » puis « Réponse : » dans la transcription. Une réponse peut continuer sur plusieurs pages. Un repère absent ou ambigu bloque l’analyse, sans attribuer zéro.</p>
    </>}
  </section>;
}

export function QuestionScopePreview({ criteria, transcription }: { criteria: RubricCriterion[]; transcription: string }) {
  const linked = criteria.filter(c => c.correctionContract?.question);
  if (!linked.length) return null;
  return <section aria-label="Rattachement des réponses"><h4>Réponses utilisées par la variante B</h4><p className="hint">Vérifiez le rattachement à partir de la copie originale. Les critères transversaux utilisent toute la transcription.</p>{linked.map(criterion => {
    const q = criterion.correctionContract!.question!;
    try { const answer = questionAnswer(transcription, q.id); return <details key={criterion.id}><summary>Question {q.id} · {criterion.title}</summary><p>Consigne : {q.instruction}</p><pre>{answer}</pre></details>; }
    catch (error) { return <p key={criterion.id} role="alert">{criterion.title} — {String(error instanceof Error ? error.message : error)}</p>; }
  })}</section>;
}
