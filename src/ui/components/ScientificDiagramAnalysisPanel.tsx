import { useState } from 'react';
import type { Rubric } from '../../domain/rubric.ts';
import type { DiagnosticModelResult, ImageInput } from '../../ports/aiProvider.ts';
import type { ScientificDiagramAnalysisService } from '../../application/scientificDiagramAnalysisService.ts';

export function ScientificDiagramAnalysisPanel({
  enabled,
  images,
  diagramImages,
  pageNumbers,
  question,
  rubric,
  model,
  endpoint,
  apiKey,
  apiCompatible,
  service,
  analysis,
  onAnalysisChange,
  onDiagnosticResult,
}: {
  enabled: boolean;
  images: ImageInput[];
  diagramImages: ImageInput[];
  pageNumbers: number[];
  question: string;
  rubric: Rubric;
  model: string;
  endpoint: string;
  apiKey: string;
  apiCompatible: boolean;
  service: ScientificDiagramAnalysisService;
  analysis: Awaited<ReturnType<ScientificDiagramAnalysisService['analyze']>> | null;
  onAnalysisChange: (analysis: Awaited<ReturnType<ScientificDiagramAnalysisService['analyze']>> | null) => void;
  onDiagnosticResult?: (result: DiagnosticModelResult) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!enabled) return null;

  async function analyze() {
    setLoading(true);
    setError('');
    onAnalysisChange(null);
    try {
      const result = await service.analyze({ images: diagramImages, pageNumbers, question, rubric, model, endpoint, apiKey, onDiagnosticResult });
      onAnalysisChange(result);
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
          <p>Correction visuelle des critères graphiques du barème.</p>
        </div>
        <span className="step-count">PAGES DÉTECTÉES</span>
      </div>
      <p>Les schémas sont évalués séparément sur l’image. Les tableaux et les réponses rédigées restent confiés au modèle textuel.</p>
      {!apiCompatible ? (
        <p className="review-alert review-alert-warning" role="status">Cette analyse nécessite un endpoint API compatible OpenAI. Activez ce fournisseur dans les réglages de l’IA avant de continuer.</p>
      ) : !model.trim() ? (
        <p className="review-alert review-alert-warning" role="status">Aucun modèle Vision n’est configuré dans les réglages de l’IA.</p>
      ) : (
        <>
          <p className="hint">Seuls les schémas scientifiques dessinés sont notés par Vision. Les tableaux restent dans le parcours textuel, où ils sont lus en Markdown. L’analyse démarre lorsque vous cliquez sur le bouton ci-dessous.</p>
          <button type="button" className="secondary-button" onClick={() => void analyze()} disabled={loading || diagramImages.length === 0}>
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
              {images[diagram.pageNumber - 1] && <figure className="scientific-diagram-evidence">
                <img src={`data:${images[diagram.pageNumber - 1].mimeType};base64,${images[diagram.pageNumber - 1].base64}`} alt={`Page ${diagram.pageNumber} contenant le schéma détecté`} style={{ display: 'block', width: '100%', maxWidth: '560px', height: 'auto' }} />
                <figcaption>Schéma scientifique sur la page originale. Vérifiez les preuves avant de retenir la note.</figcaption>
              </figure>}
              {(diagram.criteria ?? []).map((criterion) => (
                <div className="scientific-diagram-criterion" key={criterion.criterionId}>
                  <div><strong>{criterion.title}</strong><span>{criterion.points} / {criterion.maxPoints} pt</span></div>
                  <p>{criterion.evidence}</p>
                  <small>Confiance indicative : {Math.round(criterion.confidence * 100)} %{criterion.requiresTeacherReview ? ' · Vérification enseignante requise' : ''}</small>
                </div>
              ))}
              {diagram.uncertainties.map((item, index) => <p className="review-alert review-alert-warning" key={index}>{item}</p>)}
            </article>
          ))}
          {(analysis.criteria ?? []).map((criterion) => <div className="scientific-diagram-criterion" key={criterion.criterionId}><div><strong>{criterion.title}</strong><span>{criterion.points} / {criterion.maxPoints} pt</span></div><p>{criterion.evidence}</p><small>{criterion.requiresTeacherReview ? 'Vérification enseignante requise' : 'Évaluation proposée'} · Confiance : {Math.round(criterion.confidence * 100)} %</small></div>)}
          {(analysis.warnings ?? []).map((warning, index) => <p className="review-alert review-alert-warning" key={'warning-' + index}>{warning}</p>)}
          {analysis.overallUncertainties.map((item, index) => <p className="review-alert review-alert-warning" key={index}>{item}</p>)}
          <p className="hint">Les notes visuelles sont rattachées aux critères graphiques du barème et intégrées à la proposition globale. Vérifiez les preuves sur les images originales avant de valider.</p>
        </div>
      )}
    </section>
  );
}
