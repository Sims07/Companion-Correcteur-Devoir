import { useMemo, useState, type ReactNode } from 'react';
import type { BackgroundJobSummary } from '../domain/backgroundCorrection.ts';
import type { LocalCorrection } from '../domain/localCorrection.ts';
import { sumGradeScores } from '../domain/scorePrecision.ts';
import { countCopyOverviewStatuses, getLatestAvailableCorrection, sortCopyOverviewItems, toCopyOverviewStatus, type CopyOverviewFilter, type CopyOverviewStatus } from '../domain/copyOverview.ts';

type CurrentCopy = {
  label: string;
  pageCount: number;
  status: CopyOverviewStatus;
  score?: number | null;
  maximumPoints: number;
  updatedAt: string;
};
type Props = {
  children?: ReactNode;
  jobs: BackgroundJobSummary[];
  corrections: LocalCorrection[];
  currentCopy: CurrentCopy | null;
  filter: CopyOverviewFilter;
  onFilterChange: (filter: CopyOverviewFilter) => void;
  onAddCopy: () => void;
  addCopyExpanded: boolean;
  pendingCount: number;
  isStartingCorrections: boolean;
  isStoppingCorrections: boolean;
  onStopCorrections: () => void;
  onStartCorrections: () => void;
  onOpenJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onRemoveJob: (jobId: string) => void;
  notice: string;
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
  completed: 'Corrigées',
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
    score: sumGradeScores(correction.snapshot.review.map((criterion) => criterion.teacherPoints)),
    maximum: correction.snapshot.maximumPoints,
  };
}

function jobLabel(job: BackgroundJobSummary): string {
  // The saved label is authoritative: it may have been edited by the teacher.
  return job.label || 'Étudiant non identifié';
}

function jobMessage(job: BackgroundJobSummary, status: CopyOverviewStatus): string {
  if (status === 'to-retry') return 'L’IA n’a pas terminé cette copie. Vous pouvez relancer sa correction.';
  if (status === 'processing') return job.phase === 'preparation'
    ? 'Préparation de la copie et du modèle IA…'
    : job.phase === 'reading'
      ? `Lecture de la copie · ${job.progress.completedPages}/${job.progress.totalPages} pages lues`
      : `Correction · ${job.progress.completedCriteria}/${job.progress.totalCriteria} critères évalués`;
  if (status === 'to-do') return job.error?.startsWith('Correction interrompue par l’enseignant') ? 'Interrompue à votre demande. La copie est conservée.' : 'En attente de correction';
  if (job.status === 'needs-review') return 'Des éléments restent à vérifier avant de poursuivre';
  return 'Proposition prête à vérifier';
}

export function CorrectionOverview({ children, jobs, corrections, currentCopy, filter, onFilterChange, onAddCopy, addCopyExpanded, pendingCount, isStartingCorrections, isStoppingCorrections, onStopCorrections, onStartCorrections, onOpenJob, onRetryJob, onRemoveJob, notice, onOpenCorrection, onOpenCurrentCopy, onReviewNextCopy }: Props) {
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
          searchText: `${label} ${job.studentIdentity?.firstName ?? ''} ${job.studentIdentity?.lastName ?? ''} ${job.studentIdentity?.studentNumber ?? ''}`.toLocaleLowerCase('fr-FR'),
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
          pageCount: correction.pageCount ?? correction.snapshot?.images.length ?? 0,
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
  const latestCorrection = getLatestAvailableCorrection(items);
  const normalizedQuery = query.trim().toLocaleLowerCase('fr-FR');
  const visibleItems = items.filter((item) =>
    (filter === 'all' || item.status === filter) &&
    (!normalizedQuery || item.searchText.includes(normalizedQuery)),
  );
  const processingItem = items.find((item) => item.status === 'processing') ?? null;
  // The model can take time to preload before a queued copy becomes processing.
  const preparingJob = isStartingCorrections && !processingItem
    ? [...jobs].filter((job) => job.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null
    : null;
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
        {pendingCount > 0 && !processingItem && <button type="button" className="primary-button" onClick={onStartCorrections} disabled={isStartingCorrections}>{isStartingCorrections ? 'Préparation en cours…' : `Démarrer les corrections (${pendingCount})`}</button>}
        {counts.toReview > 0 && <button type="button" className="primary-button" onClick={onReviewNextCopy}>Vérifier la copie suivante</button>}
        <button type="button" className="secondary-button" onClick={onAddCopy} aria-expanded={addCopyExpanded} aria-controls="teacher-copy-intake">{addCopyExpanded ? 'Fermer l’ajout' : '＋ Ajouter des copies'}</button>
      </div>
    </header>
    {children}
    {notice && <p className="copy-overview-notice" role="status">{notice}</p>}
    <div className="teacher-copy-work-summary" aria-label="État des corrections">
      <div><strong>{counts.toReview}</strong><span>À vérifier</span></div>
      <div><strong>{counts.processing}</strong><span>En cours</span></div>
      <div><strong>{counts.toRetry}</strong><span>À reprendre</span></div>
      <div><strong>{counts.completed}</strong><span>Corrigées</span></div>
    </div>
    {latestCorrection && <div className="copy-overview-latest" aria-label="Dernière correction disponible">
      <div className="copy-overview-latest-details">
        <span className="eyebrow">DERNIÈRE CORRECTION</span>
        <strong>{latestCorrection.label}</strong>
        <small>{latestCorrection.status === 'completed' ? 'Enregistrée' : 'À vérifier'}{latestCorrection.score === null ? '' : ' · ' + number(latestCorrection.score) + ' / ' + number(latestCorrection.maximumPoints)}</small>
      </div>
      <button type="button" className="secondary-button" onClick={() => {
        if (latestCorrection.kind === 'job' && latestCorrection.job) onOpenJob(latestCorrection.job.id);
        else if (latestCorrection.kind === 'correction' && latestCorrection.correction) onOpenCorrection(latestCorrection.correction);
        else if (latestCorrection.kind === 'current') onOpenCurrentCopy();
      }}>Voir la dernière correction <span aria-hidden="true">→</span></button>
    </div>}
    {preparingJob && <div className="teacher-copy-live is-preparing" role="status"><div><strong>Préparation : {jobLabel(preparingJob)}</strong><p>Le modèle IA se prépare. La lecture de cette copie commencera ensuite.</p></div><div className="teacher-copy-live-actions"><button type="button" className="secondary-button" onClick={() => onOpenJob(preparingJob.id)}>Voir la copie</button><button type="button" className="context-stop-button" disabled={isStoppingCorrections} onClick={onStopCorrections}>{isStoppingCorrections ? 'Arrêt en cours…' : 'Arrêter'}</button></div></div>}
    {processingItem && <div className="teacher-copy-live" role="status"><div><strong>Copie en cours : {processingItem.label}</strong><p>{processingItem.message}</p></div><div className="teacher-copy-live-actions"><button type="button" className="secondary-button" onClick={() => { if (processingItem.kind === 'job') onOpenJob(processingItem.id); else onOpenCurrentCopy(); }}>Voir la copie</button><button type="button" className="context-stop-button" disabled={isStoppingCorrections} onClick={onStopCorrections}>{isStoppingCorrections ? 'Arrêt en cours…' : 'Arrêter'}</button></div></div>}
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
        <li className={`correction-series-card is-${item.status}${preparingJob?.id === item.id ? ' is-preparing' : ''}`} key={item.id}>
          <div className="correction-series-card-heading">
            <span className="queue-position">{index + 1}</span>
            <div className="correction-series-copy"><strong title={item.label}>{item.label}</strong><small>{item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}</small></div>
          </div>
          <div className="correction-series-card-score">
            <span className="correction-series-card-score-label">{item.score === null ? 'Note à venir' : item.status === 'completed' ? 'Note finale' : 'Note proposée'}</span>
            <strong className={item.score === null ? 'is-pending' : ''}>{item.score === null ? '—' : <>{number(item.score)}<span> / {number(item.maximumPoints)}</span></>}</strong>
          </div>
          <div className="correction-series-card-footer">
            <div className="correction-series-card-info">
              <div className="correction-series-card-meta">
                <span className={`correction-series-card-status is-${item.status}`}>{preparingJob?.id === item.id ? 'Préparation en cours' : item.status === 'to-do' && item.job?.error?.startsWith('Correction interrompue par l’enseignant') ? 'En attente · interrompue' : statusLabels[item.status]}</span>
                {item.kind === 'correction' && <time className="correction-series-card-date" dateTime={item.updatedAt}>Enregistrée le {new Date(item.updatedAt).toLocaleDateString('fr-FR')}</time>}
              </div>
              {item.message && <p className={item.status === 'to-retry' ? 'copy-overview-error' : 'copy-overview-message'}>{item.message}</p>}
            </div>
            <div className="correction-series-actions">
              {item.kind === 'job' && item.job && <>
                {item.status === 'to-retry' && <button type="button" className="primary-button" onClick={() => onRetryJob(item.job!.id)}>Relancer</button>}{item.status === 'to-do' && item.job.error?.startsWith('Correction interrompue par l’enseignant') && <button type="button" className="primary-button" onClick={onStartCorrections}>Reprendre les corrections</button>}
                <button type="button" className="secondary-button correction-series-view" onClick={() => onOpenJob(item.job!.id)}>Ouvrir</button>
                {item.status !== 'processing' && <button type="button" className="text-button correction-series-remove" aria-label={`Retirer la copie « ${item.label} »`} onClick={() => onRemoveJob(item.id)}>Retirer</button>}
              </>}
              {item.kind === 'current' && <button type="button" className="secondary-button correction-series-view" onClick={onOpenCurrentCopy}>Reprendre la copie</button>}
              {item.kind === 'correction' && item.correction && <button type="button" className="secondary-button correction-series-view" onClick={() => onOpenCorrection(item.correction!)}>Consulter la correction <span aria-hidden="true">→</span></button>}
            </div>
          </div>
        </li>
      ))}
    </ol> : <div className="correction-series-empty">
      <strong>{items.length === 0 ? 'Aucune copie pour le moment' : 'Aucun résultat'}</strong>
      <p>{items.length === 0 ? 'Ajoutez une première copie pour commencer.' : 'Modifiez votre recherche ou choisissez une autre catégorie.'}</p>
    </div>}
  </section>;
}
