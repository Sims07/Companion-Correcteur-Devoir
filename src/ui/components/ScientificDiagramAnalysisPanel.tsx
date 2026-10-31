import { useState } from 'react';
import type { Rubric } from '../../domain/rubric.ts';
import type { ImageInput } from '../../ports/aiProvider.ts';
import type { ScientificDiagramAnalysisService } from '../../application/scientificDiagramAnalysisService.ts';

export function ScientificDiagramAnalysisPanel({
  enabled,
  images,
  diagramImages,
  pageNumbers,
  question,
  teacherAnnotations,
  rubric,
  model,
  endpoint,
  apiKey,
  apiCompatible,
  service,
  analysis,
  onAnalysisChange,
}: {
  enabled: boolean;
  images: ImageInput[];
  diagramImages: ImageInput[];
  pageNumbers: number[];
  question: string;
  teacherAnnotations: string;
  rubric: Rubric;
  model: string;
  endpoint: string;
  apiKey: string;
  apiCompatible: boolean;
  service: ScientificDiagramAnalysisService;
  analysis: Awaited<ReturnType<ScientificDiagramAnalysisService['analyze']>> | null;
  onAnalysisChange: (analysis: Awaited<ReturnType<ScientificDiagramAnalysisService['analyze']>> | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!enabled) return null;

  async function analyze() {
    setLoading(true);
    setError('');
    onAnalysisChange(null);
    try {
      const result = await service.analyze({ images: diagramImages, pageNumbers, question, teacherAnnotations, rubric, model, endpoint, apiKey });
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
      <p>Les pages ont été classées automatiquement. Seules les pages identifiées comme schémas sont envoyées à cette correction scientifique spécialisée. Elle reste indépendante de la note textuelle.</p>
      {!apiCompatible ? (
        <p className="review-alert review-alert-warning" role="status">Cette analyse nécessite un endpoint API compatible OpenAI. Activez ce fournisseur dans les réglages de l’IA avant de continuer.</p>
      ) : !model.trim() ? (
        <p className="review-alert review-alert-warning" role="status">Aucun modèle Vision n’est configuré dans les réglages de l’IA.</p>
      ) : (
        <>
          <p className="hint">Les pages originales sont analysées par le serveur Vision configuré dans vos réglages. L’analyse démarre lorsque vous cliquez sur le bouton ci-dessous.</p>
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
                <div style={{ position: 'relative', maxWidth: '560px' }}>
                  <img src={`data:${images[diagram.pageNumber - 1].mimeType};base64,${images[diagram.pageNumber - 1].base64}`} alt={`Page ${diagram.pageNumber} contenant le schéma détecté`} style={{ display: 'block', width: '100%', height: 'auto' }} />
                  {diagram.bounds && <div role="img" aria-label="Zone du schéma repérée par Vision" style={{ position: 'absolute', left: `${diagram.bounds.x * 100}%`, top: `${diagram.bounds.y * 100}%`, width: `${diagram.bounds.width * 100}%`, height: `${diagram.bounds.height * 100}%`, border: '2px solid #d97706', boxSizing: 'border-box', pointerEvents: 'none' }} />}
                </div>
                <figcaption>Repère proposé par Vision sur la page originale. Vérifiez la zone avant de retenir le commentaire.</figcaption>
              </figure>}
              {diagram.criteria.map((criterion) => (
                <div className="scientific-diagram-criterion" key={criterion.criterionId}>
                  <div><strong>{criterion.title}</strong><span>{criterion.points} / {criterion.maxPoints} pt</span></div>
                  <p>{criterion.evidence}</p>
                  {criterion.qualityBreakdown && (
                    <details className="scientific-diagram-quality-details">
                      <summary>Voir le détail de l'évaluation</summary>
                      <ul>
                        {criterion.qualityBreakdown.map((dimension) => (
                          <li key={dimension.dimension}>
                            <div><strong>{({ title: 'Titre et identification', 'scientific-accuracy': 'Exactitude scientifique', completeness: 'Exhaustivité et pertinence', labels: 'Légendes et annotations', 'arrows-relations': 'Flèches et relations', 'organization-conventions': 'Organisation et conventions', legibility: 'Lisibilité et soin' })[dimension.dimension]}</strong><span className={`quality-status quality-status-${dimension.status}`}>{({ fulfilled: 'Conforme', partial: 'Partiel', missing: 'Manquant', 'not-applicable': 'Non applicable', uncertain: 'Incertain' })[dimension.status]}</span></div>
                            <p>{dimension.evidence}</p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <small>Confiance indicative : {Math.round(criterion.confidence * 100)} %{criterion.requiresTeacherReview ? ' · Vérification enseignante requise' : ''}</small>
                </div>
              ))}
              {diagram.uncertainties.map((item, index) => <p className="review-alert review-alert-warning" key={index}>{item}</p>)}
            </article>
          ))}
          {analysis.overallUncertainties.map((item, index) => <p className="review-alert review-alert-warning" key={index}>{item}</p>)}
          <p className="hint">Les notes visuelles sont rattachées aux critères graphiques du barème et intégrées à la proposition globale. Vérifiez les preuves sur les images originales avant de valider.</p>
        </div>
      )}
    </section>
  );
}
