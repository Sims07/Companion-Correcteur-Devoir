import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('src/ui/App.tsx', 'utf8');
const styles = readFileSync('src/ui/correctionFlow.css', 'utf8');

describe('correction en série — espace de révision', () => {
  it('identifies the student and the current copy position while reviewing', () => {
    expect(app).toContain('RÉVISION EN COURS');
    expect(app).toContain('Copie actuellement en révision');
    expect(app).toContain('getBackgroundCorrectionReviewNavigation(backgroundJobs, activeAssignmentId, currentBackgroundJobId).currentPosition');
    expect(app).toContain('getBackgroundCorrectionReviewNavigation(backgroundJobs, activeAssignmentId, currentBackgroundJobId).totalCopies');
  });

  it('shows Vision-extracted identity in the copy list and keeps a clear fallback', () => {
    expect(app).toContain('IDENTITÉ LUE PAR VISION');
    expect(app).toContain('Étudiant non identifié');
    expect(app).toContain('job.studentIdentity ? (formatStudentIdentityLabel(job.studentIdentity) ?? job.label) : job.label');
    expect(app).toContain('studentIdentity.confidence === \'medium\'');
    expect(app).toContain('setStudentLabel(next.studentIdentity ? (formatStudentIdentityLabel(next.studentIdentity) ?? next.label) : next.label)');
    expect(app).toContain('Nom et prénom à afficher');
    expect(app).not.toContain('Nom ou identifiant de l’étudiant <span>(facultatif)</span>');
  });

  it('highlights the active copy in the session list', () => {
    expect(app).toContain('className={job.id === currentBackgroundJobId ? \'is-current-review\' : undefined}');
    expect(app).toContain('En cours de révision · ');
    expect(styles).toContain('.copy-queue li.is-current-review');
  });

  it('exposes per-page rotation controls in the batch queue and pauses safely during processing', () => {
    expect(app).toContain('batch-copy-page-previews');
    expect(app).toContain('correction-series-pages');
    expect(app).toContain('job.images.map((page, pageIndex)');
    expect(app).toContain('rotationAngles?.[pageIndex]');
    expect(app).toContain('Tourner la page ${pageIndex + 1} de ${job.label} à gauche de 90 degrés');
    expect(app).toContain('Tourner la page ${pageIndex + 1} de ${job.label} à droite de 90 degrés');
    expect(app).toContain('await backgroundService.pauseAndWait()');
    expect(app).toContain('backgroundService.updateImages(job.id, nextImages, nextAngles');
    expect(app).toContain('backgroundService.resume()');
    expect(app).toContain('La transcription et les évaluations précédentes ont été invalidées');
    expect(styles).toContain('.batch-copy-page-preview img');
  });

  it('saves the current review before navigating to the next ready copy', () => {
    expect(app).toContain('onClick={() => { void finalizeReview(true); }}');
    expect(app).toContain('Enregistrer et passer à la copie suivante');
    expect(app).toContain('Aucune autre copie n’est prête à réviser pour le moment. Les autres corrections se poursuivent.');
  });

  
  it('presents the sequential batch as compact status cards with live provisional scores', () => {
    expect(app).toContain("isExpanded && !isActive ? 'is-expanded' : ''");
    expect(app).toContain('Voir les pages et la correction');
    expect(app).toContain('Masquer les pages et la correction');
    expect(app).toContain('correction-series-provisional-score');
    expect(app).toContain('Note provisoire ·');
    expect(styles).toContain('grid-template-columns: repeat(auto-fill, minmax(min(100%, 290px), 1fr))');
    expect(styles).toContain('.correction-series-list > li.is-processing');
    expect(styles).toContain('.correction-series-list > li.is-pending');
    expect(styles).toContain('.correction-series-pages figure');
    expect(styles).toContain('flex: 0 0 54px');
    expect(styles).toContain('.correction-series-live-details');
    expect(styles).toContain('.correction-series-list > li:not(.is-active):not(.is-expanded) .correction-series-pages');
    expect(styles).toContain('.correction-series-list > li.is-active {');
    expect(styles).toContain('order: -1;');
  });

  it('shows a live batch overview based on actual copy states and expands the active copy', () => {
    expect(app).toContain('correction-series-overview');
    expect(app).toContain("['ready', 'reviewing', 'completed'].includes(job.status)");
    expect(app).toContain("job.status === 'processing'");
    expect(app).toContain("['needs-review', 'failed'].includes(job.status)");
    expect(app).toContain('Copies dont la correction est disponible');
    expect(app).toContain('const isExpanded = isActive || expandedBackgroundJobIds.includes(job.id)');
    expect(app).toContain("isActive ? 'Correction en cours' : isExpanded ? 'Masquer les pages et la correction' : 'Voir les pages et la correction'");
    expect(styles).toContain('.correction-series-overview-metrics');
    expect(styles).toContain('.correction-series-list > li.is-active');
    expect(styles).toContain('grid-column: 1 / -1');
  });

  it('keeps batch actions in their own responsive row and separates failures from teacher review', () => {
    expect(app).toContain('className="correction-series-actions"');
    expect(app).toContain("job.status === 'failed' ? 'Réessayer' : 'Reprendre'");
    expect(app).toContain('L’analyse n’a pas abouti.');
    expect(app).toContain('relancer la correction');
    expect(app).not.toContain('réessayer le traitement');
    expect(app).toContain("const reviewCount = backgroundJobs.filter((job) => job.status === 'needs-review').length");
    expect(app).toContain("const failedCount = backgroundJobs.filter((job) => job.status === 'failed').length");
    expect(styles).toContain('.correction-series-actions');
    expect(styles).toContain('grid-column: 1 / -1');
    expect(styles).toContain('flex: 1 1 100%');
    expect(styles).toContain('margin-left: 2.35rem');
    expect(styles).toContain('.correction-series-overview-metrics article.has-failure');
  });

  it('uses teacher-friendly language for the copy correction overview', () => {
    expect(app).toContain('AVANCEMENT DES CORRECTIONS');
    expect(app).toContain('copies prêtes');
    expect(app).toContain('À corriger');
    expect(app).toContain('À relancer');
    expect(app).not.toContain('notes disponibles');
    expect(app).toContain('Correction des copies');
    expect(app).toContain('Corriger plusieurs copies');
    expect(app).toContain('aria-label="Copies du devoir"');
    expect(app).toContain('<h4>Copies à corriger</h4>');
    expect(app).toContain('Les copies seront corrigées l’une après l’autre.');
    expect(app).toContain('Démarrer automatiquement la correction des copies ajoutées');
    expect(app).toContain('COPIES À SUIVRE');
    expect(app).not.toContain('TRAITEMENT SÉQUENTIEL');
    expect(app).not.toContain('TRAITEMENT EN ARRIÈRE-PLAN');
    expect(app).not.toContain('Traitement séquentiel');
  });

});
