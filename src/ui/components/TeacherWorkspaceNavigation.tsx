import { useState } from 'react';

export type TeacherCopyNavigationItem = {
  id: string;
  label: string;
  status: string;
  score?: string | null;
  updatedAt?: string;
};

export interface TeacherWorkspaceNavigationProps {
  assignmentTitle: string;
  studentLabel: string;
  educationLevel?: string;
  maximumPoints?: number;
  activeSection: 'copies' | 'rubric';
  showCopyRail: boolean;
  copies: TeacherCopyNavigationItem[];
  activeCopyId: string | null;
  aiConfigured: boolean;
  settingsExpanded: boolean;
  isAnalyzing: boolean;
  processingStatus: string;
  processingDetail: string;
  onBackToAssignments: () => void;
  onSelectCopies: () => void;
  onSelectRubric: () => void;
  onOpenSettings: () => void;
  onOpenCopy: (copyId: string) => void;
  canOpenNextReviewCopy: boolean;
  nextReviewCopyLabel?: string | null;
  onOpenNextReviewCopy: () => void;
}

export function TeacherWorkspaceNavigation({
  assignmentTitle,
  studentLabel,
  educationLevel,
  maximumPoints,
  activeSection,
  showCopyRail,
  copies,
  activeCopyId,
  aiConfigured,
  settingsExpanded,
  isAnalyzing,
  processingStatus,
  processingDetail,
  onBackToAssignments,
  onSelectCopies,
  onSelectRubric,
  onOpenSettings,
  onOpenCopy,
  canOpenNextReviewCopy,
  nextReviewCopyLabel,
  onOpenNextReviewCopy,
}: TeacherWorkspaceNavigationProps) {
  const [railExpanded, setRailExpanded] = useState(true);
  const activeCopy = copies.find((copy) => copy.id === activeCopyId);
  const breadcrumbCurrent = showCopyRail
    ? (activeCopy?.label.trim() || studentLabel.trim() || 'Vérification de la copie')
    : activeSection === 'rubric' ? 'Barème' : 'Copies';

  return (
    <>
      <aside className="atelier-assignment-sidebar" aria-label="Navigation du devoir">
        <button type="button" className="atelier-sidebar-back" aria-label="Mes devoirs" onClick={onBackToAssignments} disabled={isAnalyzing}>
          <span aria-hidden="true">←</span> Tous mes devoirs
        </button>
        <div className="atelier-sidebar-assignment">
          <strong>{assignmentTitle.trim() || 'Devoir sans titre'}</strong>
          <small>{[educationLevel?.trim(), maximumPoints !== undefined ? maximumPoints + ' points' : ''].filter(Boolean).join(' · ') || 'Devoir en préparation'}</small>
        </div>
        <div className="atelier-sidebar-section">
          <span className="eyebrow">MON DEVOIR</span>
          <div className="atelier-sidebar-tabs" role="tablist" aria-label="Sections du devoir">
            <button type="button" role="tab" aria-label="Barème" aria-selected={activeSection === 'rubric'} className={activeSection === 'rubric' ? 'is-active' : ''} onClick={onSelectRubric} disabled={isAnalyzing}>
              <span className="atelier-sidebar-tab-icon" aria-hidden="true">✓</span> Préparer le barème
            </button>
            <button type="button" role="tab" aria-label="Copies" aria-selected={activeSection === 'copies'} className={activeSection === 'copies' ? 'is-active' : ''} onClick={onSelectCopies} disabled={isAnalyzing}>
              <span className="atelier-sidebar-tab-icon" aria-hidden="true">▤</span> Suivre les copies
            </button>
          </div>
        </div>
        {showCopyRail && (
          <aside className={railExpanded ? 'teacher-copy-rail is-expanded' : 'teacher-copy-rail is-collapsed'} aria-label="Navigation entre les copies">
            <div className="teacher-copy-rail-heading">
              <div><span className="eyebrow">COPIES</span><h2>Copies <span>{copies.length}</span></h2></div>
              <button type="button" aria-label={railExpanded ? 'Réduire la liste des copies' : 'Afficher la liste des copies'} aria-expanded={railExpanded} onClick={() => setRailExpanded((expanded) => !expanded)}>
                <span aria-hidden="true">{railExpanded ? '‹' : '›'}</span>
              </button>
            </div>
            {railExpanded ? (
              copies.length > 0 ? (
                <ol className="teacher-copy-rail-list">
                  {copies.map((copy) => (
                    <li key={copy.id}>
                      <button type="button" className={copy.id === activeCopyId ? 'is-active' : ''} aria-current={copy.id === activeCopyId ? 'page' : undefined} onClick={() => onOpenCopy(copy.id)} disabled={isAnalyzing}>
                        <span className="teacher-copy-rail-copy-label"><strong>{copy.label}</strong><small>{copy.status}</small></span>
                        {copy.score && <span className="teacher-copy-rail-score">{copy.score}</span>}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : <p className="teacher-copy-rail-empty">Aucune copie dans ce devoir.</p>
            ) : <p className="teacher-copy-rail-collapsed-count">{copies.length} copie(s)</p>}
            {railExpanded && <button type="button" className="secondary-button teacher-copy-rail-next-review" onClick={onOpenNextReviewCopy} disabled={!canOpenNextReviewCopy || isAnalyzing} title={nextReviewCopyLabel ? 'Prochaine copie à vérifier : ' + nextReviewCopyLabel + ' · À vérifier' : 'Aucune autre copie à vérifier pour le moment'}>Prochaine copie à vérifier</button>}
          </aside>
        )}
        <div className="atelier-sidebar-footer">
          <strong>{processingStatus}</strong>
          <small>{processingDetail}</small>
        </div>
      </aside>
      <header className="teacher-workspace-navigation">
        <nav className="teacher-breadcrumb" aria-label="Fil d’Ariane">
          <button type="button" className="teacher-breadcrumb-assignment" onClick={onSelectCopies} disabled={isAnalyzing}>{assignmentTitle.trim() || 'Devoir sans titre'}</button>
          <span aria-hidden="true">›</span>
          <strong aria-current="page">{breadcrumbCurrent}</strong>
        </nav>
        <div className="teacher-workspace-navigation-actions">
          {isAnalyzing && <div className="teacher-workspace-processing is-active" role="status" aria-live="polite">
            <span aria-hidden="true">◌</span><span><strong>{processingStatus}</strong><small>{processingDetail}</small></span>
          </div>}
          <button type="button" className={aiConfigured ? 'teacher-ai-settings-button' : 'teacher-ai-settings-button is-required'} aria-expanded={settingsExpanded} aria-controls="teacher-ai-settings-panel" onClick={onOpenSettings}>
            <span aria-hidden="true">⚙</span>{aiConfigured ? 'Réglages IA' : 'Configurer l’IA'}
          </button>
        </div>
      </header>
    </>
  );
}
