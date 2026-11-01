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
    expect(app).toContain('Aucune autre copie prête pour le moment.');
  });

  
  it('presents the sequential batch as compact status cards with live provisional scores', () => {
    expect(app).toContain("['correction-series-card', `is-${job.status}`].join(' ')");
    expect(app).toContain('correction-series-provisional-score');
    expect(app).toContain('Note provisoire ·');
    expect(styles).toContain('grid-template-columns: repeat(auto-fill, minmax(min(100%, 290px), 1fr))');
    expect(styles).toContain('.correction-series-list > li.is-processing');
    expect(styles).toContain('.correction-series-list > li.is-pending');
    expect(styles).toContain('.correction-series-pages figure');
    expect(styles).toContain('flex: 0 0 54px');
    expect(styles).toContain('.correction-series-live-details');
  });
});
