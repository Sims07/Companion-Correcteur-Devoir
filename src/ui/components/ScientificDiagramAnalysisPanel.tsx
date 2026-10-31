import { useState } from 'react';
import type { Rubric } from '../../domain/rubric.ts';
import type { ImageInput } from '../../ports/aiProvider.ts';
import type { ScientificDiagramAnalysisService } from '../../application/scientificDiagramAnalysisService.ts';
import { Checkbox } from '../design-system/components/Checkbox.tsx';

export function ScientificDiagramAnalysisPanel({
  enabled,
  images,
  question,
  rubric,
  model,
  endpoint,
  apiKey,
  apiCompatible,
  service,
}: {
  enabled: boolean;
  images: ImageInput[];
  question: string;
  rubric: Rubric;
  model: string;
  endpoint: string;
  apiKey: string;
  apiCompatible: boolean;
  service: ScientificDiagramAnalysisService;
}) {
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<ScientificDiagramAnalysisService['analyze']>> | null>(null);

  if (!enabled) return null;

  async function analyze() {
    setLoading(true);
    setError('');
    setAnalysis(null);
    try {
      const result = await service.analyze({ images, question, rubric, model, endpoint, apiKey });
      setAnalysis(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'L’analyse des schémas a échoué.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel scientific-diagram-analysis" aria-labelledby="scientific-diagram-title">
      <div className="panel-heading">
        <div>
          <h3 id="scientific-diagram-title">Analyse des schémas scientifiques</h3>
          <p>Analyse visuelle distincte de la transcription et de la notation textuelle.</p>
        </div>
        <span className="step-count">VISION · OPTIONNEL</span>
      </div>
      <p>Le modèle examine les pages originales, repère les dessins et confronte les observations au barème du devoir. Il ne modifie pas la note textuelle.</p>
      {!apiCompatible ? (
        <p className="review-alert review-alert-warning" role="status">Cette analyse nécessite un endpoint API compatible OpenAI. Activez ce fournisseur dans les réglages de l’IA avant de continuer.</p>
      ) : !model.trim() ? (
        <p className="review-alert review-alert-warning" role="status">Aucun modèle Vision n’est configuré dans les réglages de l’IA.</p>
      ) : (
        <>
          <div className="review-alert review-alert-warning">
            <strong>Transmission externe des images</strong>
            <p>Les pages originales de cette copie seront envoyées au fournisseur API configuré pour l’analyse Vision. Cette opération est distincte du traitement Ollama local et ne démarre qu’après votre autorisation explicite.</p>
          </div>
          <Checkbox checked={consent} onChange={(event) => setConsent(event.target.checked)}>
            J’autorise l’envoi des images de cette copie au fournisseur API configuré pour analyser les schémas scientifiques.
          </Checkbox>
          <button type="button" className="secondary-button" onClick={() => void analyze()} disabled={!consent || loading || images.length === 0}>
            {loading ? 'Analyse visuelle en cours…' : analysis ? 'Relancer l’analyse des schémas' : 'Analyser les schémas avec Vision'}
          </button>
        </>
      )}
      {error && <p className="review-alert review-alert-warning" role="alert">{error}</p>}
      {analysis && (
        <div className="scientific-diagram-results" aria-live="polite">
          <h4>{analysis.diagrams.length} schéma(x) détecté(s)</h4>
          {analysis.diagrams.length === 0 && <p>Aucun schéma scientifique n’a été détecté dans les pages transmises.</p>}
          {analysis.diagrams.map((diagram) => (
            <article className="scientific-diagram-result" key={diagram.id}>
              <div className="panel-heading"><div><strong>{diagram.diagramType || 'Schéma'} · page {diagram.pageNumber}</strong><p>{diagram.summary}</p></div></div>
              {diagram.criteria.map((criterion) => (
                <div className="scientific-diagram-criterion" key={criterion.criterionId}>
                  <div><strong>{criterion.title}</strong><span>{criterion.points} / {criterion.maxPoints} pt</span></div>
                  <p>{criterion.evidence}</p>
                  <small>Confiance indicative : {Math.round(criterion.confidence * 100)} %{criterion.requiresTeacherReview ? ' · Vérification enseignante requise' : ''}</small>
                </div>
              ))}
              {diagram.uncertainties.map((item, index) => <p className="review-alert review-alert-warning" key={index}>{item}</p>)}
            </article>
          ))}
          {analysis.overallUncertainties.map((item, index) => <p className="review-alert review-alert-warning" key={index}>{item}</p>)}
          <p className="hint">Ces propositions restent indépendantes de la note textuelle et doivent être vérifiées sur les images originales. Les notes ne sont pas ajoutées automatiquement au total.</p>
        </div>
      )}
    </section>
  );
}
