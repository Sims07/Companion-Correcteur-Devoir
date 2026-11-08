import type { BackgroundCorrectionJob } from '../../domain/backgroundCorrection.ts';
import type { ImageInput } from '../../ports/aiProvider.ts';
import { BackgroundCopyActivity } from './BackgroundCopyActivity.tsx';

interface Props {
  job: BackgroundCorrectionJob;
  /** Full pages loaded for the selected copy; queue overviews intentionally exclude image bytes. */
  pages?: ImageInput[];
  studentLabel?: string;
  onStopCorrections?: () => void;
  isStoppingCorrections?: boolean;
}

type Phase = BackgroundCorrectionJob['phase'];

const phaseOrder: readonly Phase[] = ['preparation', 'reading', 'grading', 'complete'];

function phaseStatus(current: Phase, position: number, order: readonly Phase[] = phaseOrder): 'complete' | 'current' | 'pending' {
  const activeIndex = order.indexOf(current);
  return activeIndex > position ? 'complete' : activeIndex === position ? 'current' : 'pending';
}

/**
 * Teacher-facing processing state, designed as the in-progress counterpart to
 * Atelier B's evidence-first review screen. No copy image leaves the browser.
 */
export function ActiveCopyProcessingWorkspace({ job, pages, studentLabel, onStopCorrections, isStoppingCorrections = false }: Props) {
  // Never render the empty base64 placeholders from IndexedDB queue overviews.
  // The teacher workspace already loaded the selected copy's full pages on opening it.
  const fullPages = pages ?? (job.imagesDeferred ? [] : job.images);
  const phase = job.phase;
  const isDiagram = job.gradingFlow === 'scientific-diagram-direct';
  const order: readonly Phase[] = isDiagram ? ['preparation', 'grading', 'complete'] : phaseOrder;
  const currentTitle = phase === 'preparation' ? 'Préparation' : isDiagram ? 'Analyse directe du schéma' : phase === 'reading' ? 'Lecture de la copie' : 'Correction des réponses';
  const phases = isDiagram ? [
    { label: 'Préparation', detail: 'Préparation des images et du modèle' },
    { label: 'Analyse directe du schéma', detail: 'Résultats fournis ensemble à la fin de la réponse' },
  ] : [
    { label: 'Préparation', detail: 'Démarrage de la correction' },
    { label: 'Lecture de la copie', detail: `${job.completedPages} / ${job.images.length} pages lues` },
    { label: 'Correction des réponses', detail: `${job.completedCriteria} / ${job.totalCriteria} critères traités` },
  ] as const;

  return (
    <section className="atelier-processing-workspace" aria-labelledby="atelier-processing-title">
      <header className="atelier-processing-heading">
        <div>
          <p className="eyebrow">COPIE EN COURS</p>
          <h2 id="atelier-processing-title">{isDiagram ? 'Correction du schéma en cours' : 'Correction en cours'}</h2>
          <p className="atelier-processing-student">{studentLabel?.trim() || job.label}</p>
        </div>
        <p className="atelier-processing-current" role="status" aria-live="polite">
          <span className="atelier-processing-indicator" aria-hidden="true" />{currentTitle}
        </p>
      </header>
      <ol className="atelier-processing-phases" aria-label="Progression de la correction">
        {phases.map((item, index) => {
          const status = phaseStatus(phase, index, order);
          return (
            <li key={item.label} className={`is-${status}`} aria-current={status === 'current' ? 'step' : undefined}>
              <span className="atelier-processing-phase-number" aria-hidden="true">{status === 'complete' ? '✓' : index + 1}</span>
              <span className="atelier-processing-phase-label">{item.label}</span>
              <small>{status === 'current' && index === 0 ? 'En cours' : status === 'pending' ? 'À venir' : index === 0 ? 'Terminée' : item.detail}</small>
            </li>
          );
        })}
      </ol>
      {onStopCorrections && <div className="context-stop-action"><button type="button" className="context-stop-button" onClick={onStopCorrections} disabled={isStoppingCorrections}>{isStoppingCorrections ? 'Arrêt en cours…' : 'Arrêter cette correction'}</button></div>}
      <div className="atelier-processing-columns">
        <section className="atelier-processing-source" aria-labelledby="atelier-processing-source-title">
          <div className="atelier-processing-source-heading">
            <h3 id="atelier-processing-source-title">Copie de l'étudiant</h3>
            <span>{job.images.length} page{job.images.length > 1 ? 's' : ''}</span>
          </div>
          <div className="atelier-processing-pages" aria-label="Pages de la copie en cours">
            {job.images.map((image, index) => {
              const fullPage = fullPages[index];
              return (
                <figure className="atelier-processing-page" key={image.fileName + '-' + index}>
                  <div className="atelier-processing-page-stage">
                    {fullPage?.base64 ? (
                      <img src={`data:${fullPage.mimeType};base64,${fullPage.base64}`} alt={`Page ${index + 1} de la copie en cours de correction`} loading={index === 0 ? 'eager' : 'lazy'} />
                    ) : <p role="status">Chargement de la page {index + 1}…</p>}
                  </div>
                  <figcaption><span>PAGE {index + 1}</span><span>{image.fileName || `Page ${index + 1}`}</span></figcaption>
                </figure>
              );
            })}
          </div>
        </section>
        <BackgroundCopyActivity job={job} />
      </div>
    </section>
  );
}
