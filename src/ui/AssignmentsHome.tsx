import { useMemo, useState } from 'react';
import type { Rubric } from '../domain/rubric.ts';
import type { BackgroundCorrectionJob } from '../domain/backgroundCorrection.ts';
import { getAssignmentOverview } from '../domain/assignmentOverview.ts';

type AssignmentCardProfile = {
  id: string;
  title: string;
  description?: string;
  educationLevel?: string;
  rubric: Rubric;
  question: string;
  correctionMode: 'integrated' | 'separate';
  hasScientificDiagrams?: boolean;
};
type ArchivedCopy = { assignmentTitle?: string };
type Props = {
  assignments: AssignmentCardProfile[];
  activeAssignmentId: string;
  archivedCorrections: ArchivedCopy[];
  backgroundJobs: BackgroundCorrectionJob[];
  onCreate: () => void;
  onOpen: (profile: AssignmentCardProfile) => void;
  onDelete: (profile: AssignmentCardProfile) => void;
  onReturn: () => void;
  disabled: boolean;
};
type Filter = 'all' | 'with-corrections' | 'to-prepare';

export function AssignmentsHome({ assignments, activeAssignmentId, archivedCorrections, backgroundJobs, onCreate, onOpen, onDelete, onReturn, disabled }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const assignmentIdsWithCopies = backgroundJobs.filter((job) => job.status !== 'completed').map((job) => job.assignmentId);
  const overview = useMemo(() => getAssignmentOverview(assignments, archivedCorrections, query, filter, assignmentIdsWithCopies), [assignments, archivedCorrections, assignmentIdsWithCopies.join('|'), filter, query]);
  const { cards, correctionCount, preparationCount } = overview;

  return <section className="assignments-home" aria-labelledby="assignments-home-title">
    <div className="assignments-home-heading">
      <div><p className="eyebrow">ESPACE ENSEIGNANT</p><h2 id="assignments-home-title">Mes devoirs</h2><p>Retrouvez vos évaluations, reprenez une correction ou préparez un nouveau devoir.</p></div>
      <button type="button" className="primary-button assignments-create-button" onClick={onCreate} disabled={disabled}><span aria-hidden="true">＋</span> Créer un devoir</button>
    </div>
    <div className="assignments-home-toolbar">
      <label className="assignments-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Rechercher un devoir" placeholder="Rechercher par nom, formation…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
      <div className="assignments-filters" role="group" aria-label="Filtrer les devoirs">
        <button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tous <span>{assignments.length}</span></button>
        <button type="button" className={filter === 'with-corrections' ? 'active' : ''} aria-pressed={filter === 'with-corrections'} onClick={() => setFilter('with-corrections')}>Avec corrections <span>{correctionCount}</span></button>
        <button type="button" className={filter === 'to-prepare' ? 'active' : ''} aria-pressed={filter === 'to-prepare'} onClick={() => setFilter('to-prepare')}>À préparer <span>{preparationCount}</span></button>
      </div>
    </div>
    {cards.length ? <div className="assignments-card-grid">{cards.map(({ profile, archivedCount, maximumPoints, ready }) => {
      const active = profile.id === activeAssignmentId;
      const activeJobs = backgroundJobs.filter((job) => job.assignmentId === profile.id && job.status !== 'completed');
      const processingCount = activeJobs.filter((job) => job.status === 'processing').length;
      const reviewCount = activeJobs.filter((job) => ['ready', 'needs-review', 'reviewing', 'failed'].includes(job.status)).length;
      const pendingCount = activeJobs.filter((job) => job.status === 'pending').length;
      const totalCopies = archivedCount + activeJobs.length;
      const statusLabel = processingCount ? 'Corrections en cours' : reviewCount ? 'À réviser' : pendingCount ? 'À corriger' : archivedCount ? 'Corrections terminées' : ready ? 'Prêt à corriger' : 'En préparation';
      return <article className={active ? 'assignment-overview-card is-active' : 'assignment-overview-card'} key={profile.id}>
        <div className="assignment-overview-top"><span className="assignment-overview-icon" aria-hidden="true">▤</span><span className={totalCopies ? 'assignment-status has-corrections' : ready ? 'assignment-status ready' : 'assignment-status preparing'}>{statusLabel}</span></div>
        <div className="assignment-overview-title"><h3>{profile.title.trim() || 'Devoir sans titre'}</h3>{active && <span className="assignment-active-label">Actif</span>}</div>
        <p className="assignment-overview-meta">{profile.educationLevel || 'Formation non renseignée'}</p>
        {profile.description && <p className="assignment-overview-description">{profile.description}</p>}
        <div className="assignment-overview-stats"><strong>{totalCopies}</strong><span>copie(s)</span><span className="assignment-stat-separator">·</span><span>{profile.rubric.criteria.length} critères</span><span className="assignment-stat-separator">·</span><span>{maximumPoints} points</span></div>
        {activeJobs.length > 0 && <p className="assignment-overview-activity">{processingCount} en cours · {pendingCount} à corriger · {reviewCount} à réviser</p>}
        <div className="assignment-overview-actions"><button type="button" className="assignment-open-button" onClick={() => onOpen(profile)} disabled={disabled}>{active ? 'Reprendre le devoir' : ready ? 'Ouvrir le devoir' : 'Configurer le devoir'} <span aria-hidden="true">→</span></button><details className="assignment-overview-menu"><summary aria-label={'Actions pour ' + (profile.title.trim() || 'devoir sans titre')}>···</summary><div><button type="button" onClick={() => onDelete(profile)} disabled={disabled || assignments.length <= 1}>Supprimer</button></div></details></div>
      </article>;
    })}</div> : <div className="assignments-empty"><span aria-hidden="true">⌕</span><h3>Aucun devoir trouvé</h3><p>Modifiez votre recherche ou créez un nouveau devoir.</p><button type="button" className="secondary-button" onClick={() => { setQuery(''); setFilter('all'); }}>Effacer les filtres</button></div>}
    <div className="assignments-home-footer"><span>Les devoirs et les corrections restent enregistrés localement sur cet appareil.</span><button type="button" className="text-button" onClick={onReturn} disabled={disabled}>Retour au devoir actif</button></div>
  </section>;
}
