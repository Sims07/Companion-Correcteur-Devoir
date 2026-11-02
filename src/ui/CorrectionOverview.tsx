import { useMemo } from 'react';
import type { BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';
import type { LocalCorrection } from '../domain/localCorrection.ts';
import { countCopyOverviewStatuses, toCopyOverviewStatus, type CopyOverviewFilter, type CopyOverviewStatus } from '../domain/copyOverview.ts';

type CurrentCopy = { label: string; pageCount: number; status: CopyOverviewStatus; score?: number | null; maximumPoints: number };
type Props = {
  jobs: BackgroundCorrectionJob[];
  corrections: LocalCorrection[];
  currentCopy: CurrentCopy | null;
  filter: CopyOverviewFilter;
  onFilterChange: (filter: CopyOverviewFilter) => void;
  onAddCopy: () => void;
  onOpenJob: (jobId: string) => void;
  onOpenCorrection: (correction: LocalCorrection) => void;
  onOpenCurrentCopy: () => void;
};

const labels: Record<CopyOverviewFilter, string> = {
  all: 'Toutes', 'to-do': 'À corriger', processing: 'En cours', 'to-review': 'À réviser', completed: 'Corrigées',
};
const statusLabels: Record<CopyOverviewStatus, string> = {
  'to-do': 'À corriger', processing: 'En cours', 'to-review': 'À réviser', completed: 'Corrigée',
};
const number = (value: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);

function scoreForJob(job: BackgroundCorrectionJob): { score: number; maximum: number; label: string } | null {
  const maximum = job.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
  if (job.proposal) return { score: job.proposal.finalScore, maximum, label: 'Note proposée' };
  if (job.partialCriteria.length) return { score: job.partialCriteria.reduce((sum, criterion) => sum + criterion.points, 0), maximum, label: 'Note provisoire' };
  return null;
}

function scoreForCorrection(correction: LocalCorrection): { score: number; maximum: number } | null {
  if (!correction.snapshot) return null;
  return {
    score: correction.snapshot.review.reduce((sum, criterion) => sum + criterion.teacherPoints, 0),
    maximum: correction.snapshot.maximumPoints,
  };
}

export function CorrectionOverview({ jobs, corrections, currentCopy, filter, onFilterChange, onAddCopy, onOpenJob, onOpenCorrection, onOpenCurrentCopy }: Props) {
  const statuses = useMemo(() => [
    ...jobs.map((job) => toCopyOverviewStatus(job.status)).filter((status) => status !== 'completed'),
    ...corrections.filter((correction) => Boolean(correction.snapshot)).map(() => 'completed' as const),
    ...(currentCopy ? [currentCopy.status] : []),
  ], [jobs, corrections, currentCopy]);
  const counts = countCopyOverviewStatuses(statuses);
  const visible = (status: CopyOverviewStatus) => filter === 'all' || filter === status;

  return <section className="copy-overview" aria-labelledby="copy-overview-title">
    <header className="copy-overview-heading">
      <div><p className="eyebrow">ESPACE DU DEVOIR</p><h2 id="copy-overview-title">Suivi des copies</h2><p>Un seul endroit pour suivre les copies, les réviser et retrouver les corrections validées.</p></div>
      <button type="button" className="primary-button" onClick={onAddCopy}>＋ Ajouter une copie</button>
    </header>
    <div className="copy-overview-filters" role="group" aria-label="Filtrer les copies">
      {(['all', 'to-do', 'processing', 'to-review', 'completed'] as const).map((key) => {
        const count = key === 'all' ? counts.all : key === 'to-do' ? counts.toDo : key === 'processing' ? counts.processing : key === 'to-review' ? counts.toReview : counts.completed;
        return <button type="button" key={key} className={filter === key ? 'is-active' : ''} aria-pressed={filter === key} onClick={() => onFilterChange(key)}>{labels[key]} <span>{count}</span></button>;
      })}
    </div>
    <ol className="correction-series-list copy-overview-grid">
      {currentCopy && visible(currentCopy.status) && <li className={`correction-series-card is-${currentCopy.status}`}>
        <div className="correction-series-card-heading"><span className="queue-position">•</span><div className="correction-series-copy"><strong>{currentCopy.label || 'Copie en cours'}</strong><small>{currentCopy.pageCount} page(s)</small></div></div>
        <div className="correction-series-card-score"><span className="correction-series-card-score-label">{currentCopy.score === null || currentCopy.score === undefined ? 'Note à venir' : 'Note proposée'}</span><strong className={currentCopy.score === null || currentCopy.score === undefined ? 'is-pending' : ''}>{currentCopy.score === null || currentCopy.score === undefined ? '—' : <>{number(currentCopy.score)}<span> / {number(currentCopy.maximumPoints)}</span></>}</strong></div>
        <div className="correction-series-card-footer"><span className={`correction-series-card-status is-${currentCopy.status}`}>{statusLabels[currentCopy.status]}</span><div className="correction-series-actions"><button type="button" className="secondary-button correction-series-view" onClick={onOpenCurrentCopy}>Reprendre la copie</button></div></div>
      </li>}
      {jobs.filter((job) => job.status !== 'completed' && visible(toCopyOverviewStatus(job.status))).map((job) => {
        const status = toCopyOverviewStatus(job.status);
        const score = scoreForJob(job);
        const name = job.studentIdentity ? [job.studentIdentity.lastName, job.studentIdentity.firstName].filter(Boolean).join(' ') || job.label : job.label;
        const description = job.status === 'processing' ? job.phase === 'reading' ? `Lecture · ${job.completedPages}/${job.images.length} pages` : `Correction · ${job.completedCriteria}/${job.totalCriteria} critères` : job.status === 'pending' ? 'En attente de correction' : job.status === 'failed' ? 'Une nouvelle tentative est nécessaire' : 'Proposition prête à réviser';
        const action = job.status === 'failed' ? 'Voir les éléments à reprendre' : status === 'to-review' ? 'Réviser la copie' : 'Consulter la copie';
        return <li className={`correction-series-card is-${job.status}`} key={job.id}>
          <div className="correction-series-card-heading"><span className="queue-position">{job.label.match(/\d+/)?.[0] ?? '•'}</span><div className="correction-series-copy"><strong title={name}>{name || 'Étudiant non identifié'}</strong><small>{job.images.length} page(s)</small></div></div>
          <div className="correction-series-card-score"><span className="correction-series-card-score-label">{score?.label ?? (job.status === 'failed' ? 'Note indisponible' : 'Note à venir')}</span><strong className={score ? '' : 'is-pending'}>{score ? <>{number(score.score)}<span> / {number(score.maximum)}</span></> : '—'}</strong></div>
          <div className="correction-series-card-footer"><span className={`correction-series-card-status is-${job.status}`}>{statusLabels[status]} · {description}</span><div className="correction-series-actions"><button type="button" className="secondary-button correction-series-view" onClick={() => onOpenJob(job.id)}>{action}</button></div></div>
        </li>;
      })}
      {corrections.filter((correction) => Boolean(correction.snapshot) && visible('completed')).map((correction) => {
        const score = scoreForCorrection(correction);
        return <li className="correction-series-card is-completed" key={correction.id}>
          <div className="correction-series-card-heading"><span className="queue-position">✓</span><div className="correction-series-copy"><strong>{correction.label}</strong><small>{correction.snapshot?.images.length ?? 0} page(s)</small></div></div>
          <div className="correction-series-card-score"><span className="correction-series-card-score-label">Note finale</span><strong>{score ? <>{number(score.score)}<span> / {number(score.maximum)}</span></> : '—'}</strong></div>
          <div className="correction-series-card-footer"><span className="correction-series-card-status is-completed">Corrigée · Enregistrée le {new Date(correction.updatedAt).toLocaleDateString('fr-FR')}</span><div className="correction-series-actions"><button type="button" className="secondary-button correction-series-view" onClick={() => onOpenCorrection(correction)}>Consulter la correction</button></div></div>
        </li>;
      })}
    </ol>
    {counts.all === 0 || (filter !== 'all' && !statuses.some(visible)) ? <div className="correction-series-empty"><strong>{counts.all === 0 ? 'Aucune copie pour le moment' : 'Aucune copie dans cette catégorie'}</strong><p>{counts.all === 0 ? 'Ajoutez une première copie pour commencer.' : 'Choisissez une autre catégorie pour retrouver vos copies.'}</p>{counts.all === 0 && <button type="button" className="primary-button" onClick={onAddCopy}>Ajouter une copie</button>}</div> : null}
  </section>;
}
