import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('src/ui/App.tsx', 'utf8');
const overview = readFileSync('src/ui/CorrectionOverview.tsx', 'utf8');
const styles = readFileSync('src/ui/correctionFlow.css', 'utf8');

describe('espace de suivi unifié des copies', () => {
  it('ouvre le suivi après la sélection du devoir et après la préparation du barème', () => {
    expect(app).toContain("? 'overview' : 'rubric'");
    expect(app).toContain("setTeacherStep('overview')");
    expect(app).toContain('teacherStep === \'overview\' && <CorrectionOverview');
  });

  it('présente les quatre états métier dans une liste unique', () => {
    for (const label of ['À corriger', 'En cours', 'À réviser', 'Corrigées']) expect(overview).toContain(label);
    expect(overview).toContain('correction-overview-grid');
    expect(overview).toContain('onOpenJob(job.id)');
    expect(overview).toContain('onOpenCorrection(correction)');
  });

  it('centralise le retour à la liste depuis la révision', () => {
    expect(app).toContain('Retour au suivi des copies');
    expect(app).not.toContain('Copies préparées en arrière-plan');
  });

  it('conserve une mise en page uniforme et responsive pour les cartes', () => {
    expect(styles).toContain('.correction-overview-grid');
    expect(styles).toContain('.correction-overview-score strong');
    expect(styles).toContain('@media (max-width:760px)');
  });
});
