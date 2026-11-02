import { useMemo, useState } from 'react';
import type { BackgroundJobSummary } from '../domain/backgroundCorrection.ts';
import type { LocalCorrection } from '../domain/localCorrection.ts';
import { countCopyOverviewStatuses, sortCopyOverviewItems, toCopyOverviewStatus, type CopyOverviewFilter, type CopyOverviewStatus } from '../domain/copyOverview.ts';

type CurrentCopy = {
  label: string;
  pageCount: number;
  status: CopyOverviewStatus;
  score?: number | null;
  maximumPoints: number;
  updatedAt: string;
};
type Props = {
  jobs: BackgroundJobSummary[];
  corrections: LocalCorrection[];
  currentCopy: CurrentCopy | null;
  filter: CopyOverviewFilter;
  onFilterChange: (filter: CopyOverviewFilter) => void;
  onAddCopy: () => void;
  onOpenJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onOpenCorrection: (correction: LocalCorrection) => void;
  onOpenCurrentCopy: () => void;
  onReviewNextCopy: () => void;
};

type OverviewItem = {
  id: string;
  label: string;
  searchText: string;
  status: CopyOverviewStatus;
  updatedAt: string;
  pageCount: number;
  score: number | null;
  maximumPoints: number;
  kind: 'job' | 'correction' | 'current';
  job?: BackgroundJobSummary;
  correction?: LocalCorrection;
  message?: string;
};

const labels: Record<CopyOverviewFilter, string> = {
  all: 'Toutes',
  'to-do': 'En attente',
  processing: 'Analyse en cours',
  'to-review': 'À vérifier',
  'to-retry': 'À reprendre',
  completed: 'Copies corrigées',
};
const statusLabels: Record<CopyOverviewStatus, string> = {
  'to-do': 'En attente',
  processing: 'Analyse en cours',
  'to-review': 'À vérifier',
  'to-retry': 'À reprendre',
  completed: 'Corrigée',
};
const number = (value: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);

function scoreForCorrection(correction: LocalCorrection): { score: number; maximum: number } | null {
  if (!correction.snapshot) return null;
  return {
    score: correction.snapshot.review.reduce((sum, criterion) => sum + criterion.teacherPoints, 0),
    maximum: correction.snapshot.maximumPoints,
  };
}

function jobLabel(job: BackgroundJobSummary): string {
  if (!job.studentIdentity) return job.label || 'Étudiant non identifié';
  return [job.studentIdentity.lastName, job.studentIdentity.firstName].filter(Boolean).join(' ') || job.label || 'Étudiant non identifié';
}

function jobMessage(job: BackgroundJobSummary, status: CopyOverviewStatus): string {
  if (status === 'to-retry') return 'La correction n’a pas abouti. Vérifiez les paramètres de l’IA locale puis réessayez.';
  if (status === 'processing') return job.phase === 'reading'
    ? `Lecture de la copie · ${job.progress.completedPages}/${job.progress.totalPages} pages`
    : `Correction · ${job.progress.completedCriteria}/${job.progress.totalCriteria} critères`;
  if (status === 'to-do') return 'En attente de correction';
  if (job.status === 'needs-review') return 'Des éléments restent à vérifier avant de poursuivre';
  return 'Proposition prête à vérifier';
}

export function CorrectionOverview({ jobs, corrections, currentCopy, filter, onFilterChange, onAddCopy, onOpenJob, onRetryJob, onOpenCorrection, onOpenCurrentCopy, onReviewNextCopy }: Props) {
  const [query, setQuery] = useState('');
  const items = useMemo(() => {
    const jobItems: OverviewItem[] = jobs
      .filter((job) => job.status !== 'completed')
      .map((job) => {
        const status = toCopyOverviewStatus(job.status);
        const label = jobLabel(job);
        return {
          id: job.id,
          label,
          searchText: `${label} ${job.label}`.toLocaleLowerCase('fr-FR'),
          status,
          updatedAt: job.updatedAt,
          pageCount: job.pageCount,
          score: job.score,
          maximumPoints: job.maximumPoints,
          kind: 'job',
          job,
          message: jobMessage(job, status),
        };
      });
    const correctionItems: OverviewItem[] = corrections
      .filter((correction) => Boolean(correction.snapshot))
      .map((correction) => {
        const score = scoreForCorrection(correction);
        return {
          id: correction.id,
          label: correction.label,
          searchText: correction.label.toLocaleLowerCase('fr-FR'),
          status: 'completed',
          updatedAt: correction.updatedAt,
          pageCount: correction.snapshot?.images.length ?? 0,
          score: score?.score ?? null,
          maximumPoints: score?.maximum ?? 0,
          kind: 'correction',
          correction,
        };
      });
    const currentItems: OverviewItem[] = currentCopy ? [{
      id: 'current-copy',
      label: currentCopy.label || 'Copie en cours',
      searchText: currentCopy.label.toLocaleLowerCase('fr-FR'),
      status: currentCopy.status,
      updatedAt: currentCopy.updatedAt,
      pageCount: currentCopy.pageCount,
      score: currentCopy.score ?? null,
      maximumPoints: currentCopy.maximumPoints,
      kind: 'current',
    }] : [];
    return sortCopyOverviewItems([...jobItems, ...correctionItems, ...currentItems]);
  }, [jobs, corrections, currentCopy]);

  const counts = countCopyOverviewStatuses(items.map((item) => item.status));
  const normalizedQuery = query.trim().toLocaleLowerCase('fr-FR');
  const visibleItems = items.filter((item) =>
    (filter === 'all' || item.status === filter) &&
    (!normalizedQuery || item.searchText.includes(normalizedQuery)),
  );
  const countFor = (key: CopyOverviewFilter) => key === 'all' ? counts.all
    : key === 'to-do' ? counts.toDo
      : key === 'processing' ? counts.processing
        : key === 'to-review' ? counts.toReview
          : key === 'to-retry' ? counts.toRetry
            : counts.completed;

  return <section className="copy-overview" aria-labelledby="copy-overview-title">
    <header className="copy-overview-heading">
      <div>
        <p className="eyebrow">ESPACE DU DEVOIR</p>
        <h2 id="copy-overview-title">Suivi des copies</h2>
        <p>Retrouvez les copies en attente, celles à vérifier et les corrections validées.</p>
      </div>
      <div className="copy-overview-primary-actions">
        {counts.toReview > 0 && <button type="button" className="primary-button" onClick={onReviewNextCopy}>Vérifier la copie suivante</button>}
        <button type="button" className="secondary-button" onClick={onAddCopy}>＋ Ajouter une copie</button>
      </div>
    </header>
    <div className="copy-overview-toolbar">
      <label className="copy-overview-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" aria-label="Rechercher par nom d’étudiant ou libellé" placeholder="Nom d’étudiant ou libellé…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <span className="copy-overview-result-count" role="status">{visibleItems.length} résultat(s)</span>
    </div>
    <div className="copy-overview-filters" role="group" aria-label="Filtrer les copies">
      {(['all', 'to-retry', 'to-review', 'processing', 'to-do', 'completed'] as const).map((key) => (
        <button type="button" key={key} className={filter === key ? 'is-active' : ''} aria-pressed={filter === key} onClick={() => onFilterChange(key)}>
          {labels[key]} <span>{countFor(key)}</span>
        </button>
      ))}
    </div>
    {visibleItems.length ? <ol className="correction-series-list copy-overview-grid">
      {visibleItems.map((item, index) => (
        <li className={`correction-series-card is-${item.status}`} key={item.id}>
          <div className="correction-series-card-heading">
            <span className="queue-position">{index + 1}</span>
            <div className="correction-series-copy"><strong title={item.label}>{item.label}</strong><small>{item.pageCount} page(s)</small></div>
          </div>
          <div className="correction-series-card-score">
            <span className="correction-series-card-score-label">{item.score === null ? 'Note à venir' : item.status === 'completed' ? 'Note finale' : 'Note proposée'}</span>
            <strong className={item.score === null ? 'is-pending' : ''}>{item.score === null ? '—' : <>{number(item.score)}<span> / {number(item.maximumPoints)}</span></>}</strong>
          </div>
          <div className="correction-series-card-footer">
            <div>
              <span className={`correction-series-card-status is-${item.status}`}>{statusLabels[item.status]}</span>
              {item.message && <p className={item.status === 'to-retry' ? 'copy-overview-error' : 'copy-overview-message'}>{item.message}</p>}
              {item.kind === 'correction' && <small>Enregistrée le {new Date(item.updatedAt).toLocaleDateString('fr-FR')}</small>}
            </div>
            <div className="correction-series-actions">
              {item.kind === 'job' && item.job && <>
                {item.status === 'to-retry' && <button type="button" className="primary-button" onClick={() => onRetryJob(item.job!.id)}>Reprendre</button>}
                <button type="button" className="secondary-button correction-series-view" onClick={() => onOpenJob(item.job!.id)}>{item.status === 'to-review' ? 'Vérifier la copie' : 'Ouvrir'}</button>
              </>}
              {item.kind === 'current' && <button type="button" className="secondary-button correction-series-view" onClick={onOpenCurrentCopy}>Reprendre la copie</button>}
              {item.kind === 'correction' && item.correction && <button type="button" className="secondary-button correction-series-view" onClick={() => onOpenCorrection(item.correction!)}>Consulter la correction</button>}
            </div>
          </div>
        </li>
      ))}
    </ol> : <div className="correction-series-empty">
      <strong>{items.length === 0 ? 'Aucune copie pour le moment' : 'Aucun résultat'}</strong>
      <p>{items.length === 0 ? 'Ajoutez une première copie pour commencer.' : 'Modifiez votre recherche ou choisissez une autre catégorie.'}</p>
      {items.length === 0 && <button type="button" className="primary-button" onClick={onAddCopy}>Ajouter une copie</button>}
    </div>}
  </section>;
}
