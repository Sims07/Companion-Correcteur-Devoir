import { describe, expect, it } from 'vitest';
import { appBrowserPage, browserPageHash, parseBrowserPage, type BrowserPage } from '../../src/shell/domain/browserNavigation.ts';

describe('navigateur : destinations de l’application', () => {
  const pages: BrowserPage[] = [
    { kind: 'assignments' },
    { kind: 'teacher', assignmentId: 'assignment-default', section: 'rubric' },
    { kind: 'teacher', assignmentId: 'assignment-default', section: 'copies' },
    { kind: 'teacher', assignmentId: 'devoir 2', section: 'add' },
    { kind: 'teacher', assignmentId: 'devoir 2', section: 'new-copy' },
    { kind: 'teacher', assignmentId: 'devoir 2', section: 'copy', copyId: 'queued-copy-123' },
    { kind: 'teacher', assignmentId: 'devoir 2', section: 'copy', copyId: 'correction 42' },
    { kind: 'evaluation', step: 'dashboard', journey: 'diagrams', view: 'protocols' },
    { kind: 'evaluation', step: 'campaigns', journey: 'diagrams', view: 'protocols' },
    { kind: 'evaluation', step: 'configuration', journey: 'diagrams', view: 'history' },
    { kind: 'evaluation', step: 'configuration', journey: 'biology', view: 'biology-radar' },
    { kind: 'evaluation', step: 'results', journey: 'custom', view: 'protocols' },
    { kind: 'observability', view: 'observability' },
    { kind: 'observability', view: 'debug' },
  ];

  it.each(pages)('aller-retour URL sans état métier ni données d’étudiant : $kind', (page) => {
    const hash = browserPageHash(page);
    expect(parseBrowserPage(hash)).toEqual(page);
    expect(hash).not.toContain(' ');
    expect(hash).not.toContain('copie.png');
  });

  it('rejette les routes illisibles, inconnues ou les segments dangereux', () => {
    for (const hash of ['', '#/', '#/inconnue', '#/devoir/x/audit', '#/devoir/a/copie',
      '#/devoir/%ZZ/copies', '#/devoir/%2Fsecret/copies', '#/devoir/a/copie/%23secret',
      '#/evaluation/biology/configuration/foobar', '#/evaluation/unknown/results/radar']) {
      expect(parseBrowserPage(hash)).toBeNull();
    }
  });

  it('associe les écrans de correction à un devoir et à sa copie, jamais à un libellé', () => {
    const base = {
      interfaceMode: 'teacher' as const, showAssignmentsHome: false, activeAssignmentId: 'assignment-default',
      teacherStep: 'review' as const, showCopyIntake: false, currentCopyId: 'queued-copy-7',
      evaluationWorkspaceStep: 'dashboard' as const, evaluationJourney: 'diagrams' as const,
      diagramLabView: 'protocols' as const, biologyRadarOpen: false,
    };
    expect(browserPageHash(appBrowserPage(base))).toBe('#/devoir/assignment-default/copie/queued-copy-7');
    expect(browserPageHash(appBrowserPage({ ...base, teacherStep: 'rubric' }))).toBe('#/devoir/assignment-default/bareme');
    expect(browserPageHash(appBrowserPage({ ...base, teacherStep: 'overview', showCopyIntake: true }))).toBe('#/devoir/assignment-default/ajouter');
    expect(browserPageHash(appBrowserPage({ ...base, teacherStep: 'copy', currentCopyId: null }))).toBe('#/devoir/assignment-default/nouvelle-copie');
    expect(browserPageHash(appBrowserPage({ ...base, showAssignmentsHome: true }))).toBe('#/devoirs');
  });

  it('garde les écrans de suivi et les sous-espaces du laboratoire adressables', () => {
    const base = {
      interfaceMode: 'diagnostic' as const, showAssignmentsHome: false, activeAssignmentId: 'assignment-default',
      teacherStep: 'overview' as const, showCopyIntake: false, currentCopyId: null,
      evaluationWorkspaceStep: 'configuration' as const, evaluationJourney: 'biology' as const,
      diagramLabView: 'protocols' as const, biologyRadarOpen: true,
    };
    expect(browserPageHash(appBrowserPage(base))).toBe('#/evaluation/biology/configuration/biology-radar');
    expect(browserPageHash(appBrowserPage({ ...base, interfaceMode: 'debug' }))).toBe('#/reseau');
    expect(browserPageHash(appBrowserPage({ ...base, interfaceMode: 'observability' }))).toBe('#/suivi');
  });
});
