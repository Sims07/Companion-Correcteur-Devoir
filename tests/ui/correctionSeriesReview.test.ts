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

  it('highlights the active copy in the session list', () => {
    expect(app).toContain('className={job.id === currentBackgroundJobId ? \'is-current-review\' : undefined}');
    expect(app).toContain('En cours de révision · ');
    expect(styles).toContain('.copy-queue li.is-current-review');
  });

  it('saves the current review before navigating to the next ready copy', () => {
    expect(app).toContain('onClick={() => { void finalizeReview(true); }}');
    expect(app).toContain('Enregistrer et passer à la copie suivante');
    expect(app).toContain('Aucune autre copie prête pour le moment.');
  });
});
