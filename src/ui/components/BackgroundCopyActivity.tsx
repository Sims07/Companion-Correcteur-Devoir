import type { BackgroundCorrectionJob } from '../../domain/backgroundCorrection.ts';
import './BackgroundCopyActivity.css';

type Props = { job: BackgroundCorrectionJob };

/**
 * Teacher-facing activity is based on persisted results, not generated prose.
 * The active criterion is shown only when the worker has explicitly recorded it.
 */
export function BackgroundCopyActivity({ job }: Props) {
  const processed = new Map(job.partialCriteria.map((result) => [result.criterionId, result]));
  const total = job.rubric.criteria.length;
  const done = job.rubric.criteria.filter((criterion) => processed.has(criterion.id)).length;
  const isDiagram = job.gradingFlow === 'scientific-diagram-direct';
  const current = job.phase === 'grading' && !isDiagram ? job.activeCriterionId : null;

  return (
    <section className="background-copy-activity" aria-labelledby="background-copy-activity-title">
      <header className="background-copy-activity-heading">
        <div>
          <h4 id="background-copy-activity-title">Critères du barème</h4>
          <p>{isDiagram ? 'Résultats affichés ensemble après l’analyse directe.' : 'Résultats disponibles progressivement.'}</p>
        </div>
        <strong className="background-copy-activity-counter">{done} / {total}</strong>
      </header>

      <div className="background-copy-activity-track" role="progressbar" aria-label="Critères du barème traités" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>

      <ol className="background-copy-activity-criteria">
        {job.rubric.criteria.map((criterion) => {
          const result = processed.get(criterion.id);
          const needsReview = result?.assessmentStatus === 'not-evaluated';
          const active = !result && current === criterion.id;
          const status = needsReview ? 'À vérifier' : result ? 'Analysé' : active ? 'En cours' : isDiagram && job.phase === 'grading' ? 'Analyse en cours' : 'À venir';
          return (
            <li key={criterion.id} className={active ? 'is-active' : result ? needsReview ? 'needs-review' : 'is-complete' : 'is-pending'}>
              <span className="background-copy-activity-marker" aria-hidden="true">{result && !needsReview ? '✓' : active ? '●' : needsReview ? '!' : '·'}</span>
              <span className="background-copy-activity-title">{criterion.title}</span>
              <small aria-current={active ? 'step' : undefined}>{status}</small>
            </li>
          );
        })}
      </ol>

      {job.phase === 'grading' && !current && done < total && (
        <p className="background-copy-activity-note" role="status">{isDiagram ? 'Analyse directe de l’image en cours. Les notes arriveront ensemble à la fin.' : 'Analyse en cours. Le prochain résultat apparaîtra ici.'}</p>
      )}
      {job.transcription?.trim() && (
        <details className="background-copy-transcription">
          <summary>Consulter le texte reconnu <small>Facultatif</small></summary>
          <pre className="live-transcription-text">{job.transcription}</pre>
        </details>
      )}
    </section>
  );
}
