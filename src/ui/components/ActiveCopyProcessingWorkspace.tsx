import type { BackgroundCorrectionJob } from '../../domain/backgroundCorrection.ts';
import { BackgroundCopyActivity } from './BackgroundCopyActivity.tsx';

interface Props {
  job: BackgroundCorrectionJob;
  studentLabel?: string;
}

type Phase = BackgroundCorrectionJob['phase'];

const phaseOrder: readonly Phase[] = ['preparation', 'reading', 'grading', 'complete'];

function phaseStatus(current: Phase, position: number): 'complete' | 'current' | 'pending' {
  const activeIndex = phaseOrder.indexOf(current);
  return activeIndex > position ? 'complete' : activeIndex === position ? 'current' : 'pending';
}

/**
 * Teacher-facing processing state, designed as the in-progress counterpart to
 * Atelier B's evidence-first review screen. No copy image leaves the browser.
 */
export function ActiveCopyProcessingWorkspace({ job, studentLabel }: Props) {
  const phase = job.phase;
  const currentTitle = phase === 'preparation' ? 'Préparation' : phase === 'reading' ? 'Lecture de la copie' : 'Correction des réponses';
  const phases = [
    { label: 'Préparation', detail: 'Démarrage de la correction' },
    { label: 'Lecture de la copie', detail: `${job.completedPages} / ${job.images.length} pages lues` },
    { label: 'Correction des réponses', detail: `${job.completedCriteria} / ${job.totalCriteria} critères traités` },
  ] as const;

  return (
    <section className="atelier-processing-workspace" aria-labelledby="atelier-processing-title">
      <header className="atelier-processing-heading">
        <div>
          <p className="eyebrow">COPIE EN COURS</p>
          <h2 id="atelier-processing-title">Correction en cours</h2>
          <p className="atelier-processing-student">{studentLabel?.trim() || job.label}</p>
        </div>
        <p className="atelier-processing-current" role="status" aria-live="polite">
          <span className="atelier-processing-indicator" aria-hidden="true" />{currentTitle}
        </p>
      </header>
      <ol className="atelier-processing-phases" aria-label="Progression de la correction">
        {phases.map((item, index) => {
          const status = phaseStatus(phase, index);
          return (
            <li key={item.label} className={`is-${status}`} aria-current={status === 'current' ? 'step' : undefined}>
              <span className="atelier-processing-phase-number" aria-hidden="true">{status === 'complete' ? '✓' : index + 1}</span>
              <span className="atelier-processing-phase-label">{item.label}</span>
              <small>{status === 'current' && index === 0 ? 'En cours' : status === 'pending' ? 'À venir' : index === 0 ? 'Terminée' : item.detail}</small>
            </li>
          );
        })}
      </ol>
      <div className="atelier-processing-columns">
        <section className="atelier-processing-source" aria-labelledby="atelier-processing-source-title">
          <div className="atelier-processing-source-heading">
            <h3 id="atelier-processing-source-title">Copie de l'étudiant</h3>
            <span>{job.images.length} page{job.images.length > 1 ? 's' : ''}</span>
          </div>
          <div className="atelier-processing-pages" aria-label="Pages de la copie en cours">
            {job.images.map((image, index) => (
              <figure className="atelier-processing-page" key={image.fileName + '-' + index}>
                <div className="atelier-processing-page-stage">
                  <img src={`data:${image.mimeType};base64,${image.base64}`} alt={`Page ${index + 1} de la copie en cours de correction`} loading={index === 0 ? 'eager' : 'lazy'} />
                </div>
                <figcaption><span>PAGE {index + 1}</span><span>{image.fileName || `Page ${index + 1}`}</span></figcaption>
              </figure>
            ))}
          </div>
        </section>
        <BackgroundCopyActivity job={job} />
      </div>
    </section>
  );
}
