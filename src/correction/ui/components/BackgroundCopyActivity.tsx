import type { BackgroundCorrectionJob } from '../../domain/backgroundCorrection.ts';
import './BackgroundCopyActivity.css';

type Props = { job: BackgroundCorrectionJob };

/**
 * Shows only progress recorded by the worker. Direct image grading can run
 * globally or sequentially, and those modes must not look identical.
 */
export function BackgroundCopyActivity({ job }: Props) {
  const processed = new Map(job.partialCriteria.map((result) => [result.criterionId, result]));
  const total = job.rubric.criteria.length;
  const done = job.rubric.criteria.filter((criterion) => processed.has(criterion.id)).length;
  const isDiagram = job.gradingFlow === 'scientific-diagram-direct';
  const isRunning = job.status === 'processing' && job.phase === 'grading';
  const current = isRunning ? job.activeCriterionId : null;
  const currentIndex = job.rubric.criteria.findIndex((criterion) => criterion.id === current);
  const currentCriterion = currentIndex >= 0 && !processed.has(current!) ? job.rubric.criteria[currentIndex] : null;
  // Jobs from older versions can lack the recorded granularity.
  const isSequential = !isDiagram || job.criterionByCriterion === true || Boolean(currentCriterion) || (isDiagram && done > 0);
  const remaining = Math.max(0, total - done);

  const focus = !isRunning ? null : currentCriterion
    ? { label: `CRITÈRE ${currentIndex + 1} SUR ${total}`, title: currentCriterion.title, detail: 'Le modèle analyse ce critère.' }
    : done === total
      ? { label: 'FINALISATION', title: 'Préparation des résultats', detail: 'Tous les critères ont été examinés.' }
      : isDiagram && !isSequential
        ? { label: 'ANALYSE GLOBALE', title: 'Lecture du schéma en cours', detail: 'Les résultats arriveront ensemble à la fin.' }
        : {
          label: 'PROGRESSION',
          title: done ? 'Passage au critère suivant' : 'Démarrage de l’analyse des critères',
          detail: `${done} critère${done > 1 ? 's' : ''} examiné${done > 1 ? 's' : ''} · ${remaining} restant${remaining > 1 ? 's' : ''}`,
        };

  return (
    <section className="background-copy-activity" aria-labelledby="background-copy-activity-title">
      <header className="background-copy-activity-heading">
        <div>
          <h4 id="background-copy-activity-title">Critères du barème</h4>
          <p>{isDiagram && !isSequential ? 'Résultats disponibles à la fin de l’analyse globale.' : 'Chaque critère apparaît dès que son analyse est terminée.'}</p>
        </div>
        <strong className="background-copy-activity-counter">{done} / {total}</strong>
      </header>

      {focus && (
        <div className="background-copy-activity-focus" role="status" aria-live="polite" aria-atomic="true">
          <span className="background-copy-activity-focus-dot" aria-hidden="true" />
          <div>
            <span className="background-copy-activity-focus-label">{focus.label}</span>
            <strong className="background-copy-activity-focus-title">{focus.title}</strong>
            <small className="background-copy-activity-focus-detail">{focus.detail}</small>
          </div>
        </div>
      )}

      <div className="background-copy-activity-track" role="progressbar" aria-label="Critères du barème traités"
        aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}
        aria-valuetext={`${done} sur ${total} critères examinés`}>
        <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>

      <ol className="background-copy-activity-criteria">
        {job.rubric.criteria.map((criterion) => {
          const result = processed.get(criterion.id);
          const needsReview = result?.assessmentStatus === 'not-evaluated';
          const active = !result && currentCriterion?.id === criterion.id;
          const status = needsReview ? 'À vérifier' : result ? 'Terminé' : active ? 'En cours' : 'À venir';
          return (
            <li key={criterion.id} className={active ? 'is-active' : result ? needsReview ? 'needs-review' : 'is-complete' : 'is-pending'}
              aria-current={active ? 'step' : undefined}>
              <span className="background-copy-activity-marker" aria-hidden="true">{result && !needsReview ? '✓' : active ? '●' : needsReview ? '!' : '·'}</span>
              <span className="background-copy-activity-title">{criterion.title}</span>
              <small>{status}</small>
            </li>
          );
        })}
      </ol>

      {job.transcription?.trim() && (
        <details className="background-copy-transcription">
          <summary>Consulter le texte reconnu <small>Facultatif</small></summary>
          <pre className="live-transcription-text">{job.transcription}</pre>
        </details>
      )}
    </section>
  );
}
