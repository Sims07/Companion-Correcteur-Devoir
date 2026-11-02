import { useState } from 'react';
import type { BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';
import { backgroundCorrectionStatusLabel } from '../domain/backgroundCorrection.ts';
import { getCorrectionCopyStatus, getCorrectionOverviewCounts, type CorrectionCopyStatus } from '../domain/correctionOverview.ts';
import type { LocalCorrection } from '../domain/localCorrection.ts';

type CurrentCopy = {
  label: string;
  pageCount: number;
  status: 'to-do' | 'processing' | 'to-review';
};

type Filter = 'all' | CorrectionCopyStatus;

type Props = {
  jobs: BackgroundCorrectionJob[];
  corrections: LocalCorrection[];
  currentCopy: CurrentCopy | null;
  currentBackgroundJobId: string | null;
  onAddCopy: () => void;
  onOpenJob: (jobId: string) => void;
  onOpenCorrection: (correction: LocalCorrection) => void;
  onOpenCurrentCopy: () => void;
};

const filterLabels: Record<Filter, string> = {
  all: 'Toutes',
  'to-do': 'À corriger',
  processing: 'En cours',
  'to-review': 'À réviser',
  completed: 'Corrigées',
};

function formatScore(correction: LocalCorrection): string | null {
  if (!correction.snapshot) return null;
  const points = correction.snapshot.review.reduce((sum, criterion) => sum + criterion.teacherPoints, 0);
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(points)} / ${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(correction.snapshot.maximumPoints)}`;
}

export function CorrectionOverview({ jobs, corrections, currentCopy, currentBackgroundJobId, onAddCopy, onOpenJob, onOpenCorrection, onOpenCurrentCopy }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const visibleJobs = jobs.filter((job) => job.status !== 'completed');
  const statuses = [
    ...visibleJobs.map((job) => getCorrectionCopyStatus(job.status)),
    ...corrections.filter((correction) => Boolean(correction.snapshot)).map(() => 'completed' as const),
    ...(currentCopy && !currentBackgroundJobId ? [currentCopy.status] : []),
  ];
  const counts = getCorrectionOverviewCounts(statuses);
  const matches = (status: CorrectionCopyStatus) => filter === 'all' || filter === status;

  return <section className="correction-overview" aria-labelledby="correction-overview-title">
    <header className="correction-overview-heading">
      <div><p className="eyebrow">ESPACE DU DEVOIR</p><h2 id="correction-overview-title">Suivi des copies</h2><p>Retrouvez toutes les copies de ce devoir, quel que soit leur mode de correction.</p></div>
      <button type="button" className="primary-button" onClick={onAddCopy}>＋ Ajouter une copie</button>
    </header>
    <div className="correction-overview-filters" role="group" aria-label="Filtrer les copies">
      {(['all', 'to-do', 'processing', 'to-review', 'completed'] as const).map((key) => {
        const count = key === 'all' ? counts.all : key === 'to-do' ? counts.toDo : key === 'processing' ? counts.processing : key === 'to-review' ? counts.toReview : counts.completed;
        return <button type="button" key={key} className={filter === key ? 'is-active' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}><span>{filterLabels[key]}</span><strong>{count}</strong></button>;
      })}
    </div>
    <div className="correction-overview-grid">
      {currentCopy && !currentBackgroundJobId && matches(currentCopy.status) && <article className={`correction-overview-card is-${currentCopy.status}`}>
        <div className="correction-overview-card-top"><span className="correction-overview-status">{currentCopy.status === 'processing' ? 'En cours' : currentCopy.status === 'to-review' ? 'À réviser' : 'À corriger'}</span><span className="correction-overview-pages">{currentCopy.pageCount} page(s)</span></div>
        <div className="correction-overview-score"><strong>—</strong><span>Note à venir</span></div>
        <h3>{currentCopy.label || 'Copie en cours'}</h3>
        <button type="button" className="correction-overview-open" onClick={onOpenCurrentCopy}>Reprendre la copie <span aria-hidden="true">→</span></button>
      </article>}
      {visibleJobs.filter((job) => matches(getCorrectionCopyStatus(job.status))).map((job) => {
        const status = getCorrectionCopyStatus(job.status);
        const progress = job.totalCriteria > 0 ? Math.round((job.completedCriteria / job.totalCriteria) * 100) : 0;
        return <article className={`correction-overview-card is-${status}`} key={job.id}>
          <div className="correction-overview-card-top"><span className="correction-overview-status">{status === 'to-do' ? 'À corriger' : status === 'processing' ? 'En cours' : 'À réviser'}</span><span className="correction-overview-pages">{job.images.length} page(s)</span></div>
          <div className="correction-overview-score"><strong>{status === 'to-review' && job.proposal ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(job.proposal.finalScore)} / ${job.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0)}` : '—'}</strong><span>{status === 'processing' ? job.phase === 'reading' ? 'Lecture de la copie' : 'Correction en cours' : status === 'to-review' ? 'Proposition disponible' : 'En attente'}</span></div>
          <h3>{job.label || 'Étudiant non identifié'}</h3>
          {status === 'processing' && <div className="correction-overview-progress" role="progressbar" aria-label={`Progression de ${job.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>}
          <p className="correction-overview-detail">{status === 'processing' ? job.phase === 'reading' ? `Lecture · ${job.completedPages}/${job.images.length} pages` : `Correction · ${job.completedCriteria}/${job.totalCriteria} critères` : backgroundCorrectionStatusLabel(job.status)}</p>
          <button type="button" className="correction-overview-open" onClick={() => onOpenJob(job.id)}>{status === 'to-review' ? 'Réviser la copie' : status === 'processing' ? 'Voir la progression' : 'Ouvrir la copie'} <span aria-hidden="true">→</span></button>
        </article>;
      })}
      {corrections.filter((correction) => Boolean(correction.snapshot) && matches('completed')).map((correction) => <article className="correction-overview-card is-completed" key={correction.id}>
        <div className="correction-overview-card-top"><span className="correction-overview-status">Corrigée</span><span className="correction-overview-pages">{correction.snapshot?.images.length ?? 0} page(s)</span></div>
        <div className="correction-overview-score"><strong>{formatScore(correction) ?? '—'}</strong><span>Note finale</span></div>
        <h3>{correction.label}</h3>
        <p className="correction-overview-detail">Enregistrée le {new Date(correction.updatedAt).toLocaleDateString('fr-FR')}</p>
        <button type="button" className="correction-overview-open" onClick={() => onOpenCorrection(correction)}>Consulter la correction <span aria-hidden="true">→</span></button>
      </article>)}
    </div>
    {counts.all === 0 || (filter !== 'all' && !statuses.some(matches)) ? <div className="correction-overview-empty"><strong>{counts.all === 0 ? 'Aucune copie pour le moment' : 'Aucune copie dans cette catégorie'}</strong><p>{counts.all === 0 ? 'Ajoutez une première copie pour commencer.' : 'Choisissez une autre catégorie pour retrouver vos copies.'}</p>{counts.all === 0 && <button type="button" className="secondary-button" onClick={onAddCopy}>Ajouter une copie</button>}</div> : null}
  </section>;
}
