import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('src/ui/App.tsx', 'utf8');
const assignmentsHome = readFileSync('src/ui/AssignmentsHome.tsx', 'utf8');
const overview = readFileSync('src/ui/CorrectionOverview.tsx', 'utf8');
const styles = readFileSync('src/ui/correctionFlow.css', 'utf8');

describe('parcours unifié des copies dans un devoir', () => {
  it('ouvre le suivi des copies après sélection d’un devoir déjà configuré', () => {
    expect(app).toContain("getTeacherEntryStep(profile.rubric) === 'copies' ? 'overview' : 'rubric'");
    expect(app).toContain("teacherStep === 'overview' && <CorrectionOverview");
    expect(app).toContain("onClick={() => setTeacherStep('overview')}");
  });

  it('propose un seul parcours de suivi quel que soit le mode de correction', () => {
    expect(overview).toContain("jobs.map((job) => toCopyOverviewStatus(job.status))");
    expect(overview).toContain("corrections.filter((correction) => Boolean(correction.snapshot))");
    expect(overview).toContain("labels[key]");
    expect(overview).toContain('aria-label="Filtrer les copies"');
    expect(overview).toContain('Consulter la correction');
    expect(overview).toContain('Réviser la copie');
  });

  it('garde les copies en cours visibles depuis la bibliothèque des devoirs', () => {
    expect(app).toContain('backgroundJobs={allBackgroundJobs}');
    expect(app).toContain('backgroundService.subscribe((jobs) => setAllBackgroundJobs(jobs))');
    expect(app).toContain('backgroundService.listJobs().then((jobs) => { if (active) setAllBackgroundJobs(jobs); })');
    expect(assignmentsHome).toContain('backgroundJobs: BackgroundCorrectionJob[]');
    expect(assignmentsHome).toContain('Corrections en cours');
    expect(assignmentsHome).toContain('À réviser');
    expect(assignmentsHome).toContain('À corriger');
  });

  it('utilise des cartes de taille homogène avec la note au premier plan', () => {
    expect(styles).toContain('.copy-overview-grid > li.correction-series-card');
    expect(styles).toContain('grid-auto-rows: 1fr');
    expect(styles).toContain('.copy-overview-grid .correction-series-card-score');
    expect(styles).toContain('min-height: 86px');
  });
});
