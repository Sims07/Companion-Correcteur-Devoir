/**
 * Addressable, privacy-conscious app destinations. Only local opaque IDs appear
 * in URLs; names, marks, questions, student data and AI credentials never do.
 * Hash routes work on GitHub Pages and in the installed offline PWA.
 */
export type EvaluationPageStep = 'dashboard' | 'campaigns' | 'configuration' | 'execution' | 'results' | 'history';
export type EvaluationJourney = 'custom' | 'diagrams' | 'biology';
export type DiagramLabView = 'protocols' | 'history' | 'radar';

export type BrowserPage =
  | { kind: 'assignments' }
  | { kind: 'teacher'; assignmentId: string; section: 'rubric' | 'copies' | 'add' | 'new-copy' | 'copy'; copyId?: string }
  | { kind: 'evaluation'; step: EvaluationPageStep; journey: EvaluationJourney; view: DiagramLabView | 'biology-radar' }
  | { kind: 'observability'; view: 'observability' | 'debug' };

const validSteps: readonly string[] = ['dashboard', 'campaigns', 'configuration', 'execution', 'results', 'history'];
const validJourneys: readonly string[] = ['custom', 'diagrams', 'biology'];
const validViews: readonly string[] = ['protocols', 'history', 'radar', 'biology-radar'];

function fromSegment(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded && !/[\\/\\?#]/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function parseBrowserPage(hash: string): BrowserPage | null {
  if (!hash.startsWith('#/')) return null;
  const segments = hash.slice(2).split('/');
  if (segments.length === 1 && segments[0] === 'devoirs') return { kind: 'assignments' };
  if (segments[0] === 'devoir' && segments.length >= 3 && segments.length <= 4) {
    const assignmentId = fromSegment(segments[1]);
    if (!assignmentId) return null;
    if (segments[2] === 'bareme' && segments.length === 3) return { kind: 'teacher', assignmentId, section: 'rubric' };
    if (segments[2] === 'copies' && segments.length === 3) return { kind: 'teacher', assignmentId, section: 'copies' };
    if (segments[2] === 'ajouter' && segments.length === 3) return { kind: 'teacher', assignmentId, section: 'add' };
    if (segments[2] === 'nouvelle-copie' && segments.length === 3) return { kind: 'teacher', assignmentId, section: 'new-copy' };
    if (segments[2] === 'copie' && segments.length === 4) {
      const copyId = fromSegment(segments[3]);
      return copyId ? { kind: 'teacher', assignmentId, section: 'copy', copyId } : null;
    }
  }
  if (segments[0] === 'evaluation') {
    if (segments.length === 2 && (segments[1] === 'dashboard' || segments[1] === 'campaigns')) {
      return { kind: 'evaluation', step: segments[1], journey: 'diagrams', view: 'protocols' };
    }
    if (segments.length === 4 && validJourneys.includes(segments[1]) && validSteps.includes(segments[2]) && validViews.includes(segments[3])) {
      return { kind: 'evaluation', journey: segments[1] as EvaluationJourney, step: segments[2] as EvaluationPageStep, view: segments[3] as DiagramLabView | 'biology-radar' };
    }
  }
  if (segments.length === 1 && segments[0] === 'suivi') return { kind: 'observability', view: 'observability' };
  if (segments.length === 1 && segments[0] === 'reseau') return { kind: 'observability', view: 'debug' };
  return null;
}

export function browserPageHash(page: BrowserPage): string {
  if (page.kind === 'assignments') return '#/devoirs';
  if (page.kind === 'observability') return page.view === 'debug' ? '#/reseau' : '#/suivi';
  if (page.kind === 'evaluation') {
    if (page.step === 'dashboard' || page.step === 'campaigns') return '#/evaluation/' + page.step;
    return '#/evaluation/' + page.journey + '/' + page.step + '/' + page.view;
  }
  const prefix = '#/devoir/' + encodeURIComponent(page.assignmentId);
  if (page.section === 'rubric') return prefix + '/bareme';
  if (page.section === 'add') return prefix + '/ajouter';
  if (page.section === 'new-copy') return prefix + '/nouvelle-copie';
  if (page.section === 'copy' && page.copyId) return prefix + '/copie/' + encodeURIComponent(page.copyId);
  return prefix + '/copies';
}

export function appBrowserPage(state: {
  interfaceMode: 'teacher' | 'diagnostic' | 'observability' | 'debug';
  showAssignmentsHome: boolean;
  activeAssignmentId: string;
  teacherStep: 'details' | 'rubric' | 'overview' | 'copy' | 'progress' | 'review';
  showCopyIntake: boolean;
  currentCopyId: string | null;
  evaluationWorkspaceStep: EvaluationPageStep;
  evaluationJourney: EvaluationJourney;
  diagramLabView: DiagramLabView;
  biologyRadarOpen: boolean;
}): BrowserPage {
  if (state.interfaceMode === 'debug' || state.interfaceMode === 'observability')
    return { kind: 'observability', view: state.interfaceMode };
  if (state.interfaceMode === 'diagnostic')
    return { kind: 'evaluation', step: state.evaluationWorkspaceStep, journey: state.evaluationJourney,
      view: state.evaluationJourney === 'biology' && state.biologyRadarOpen ? 'biology-radar' : state.diagramLabView };
  if (state.showAssignmentsHome) return { kind: 'assignments' };
  const section: 'rubric' | 'copies' | 'add' | 'new-copy' | 'copy' =
    state.teacherStep === 'rubric' || state.teacherStep === 'details' ? 'rubric'
    : state.teacherStep === 'overview' ? (state.showCopyIntake ? 'add' : 'copies')
    : state.currentCopyId ? 'copy' : state.teacherStep === 'review' ? 'copies' : 'new-copy';
  return { kind: 'teacher', assignmentId: state.activeAssignmentId, section,
    ...(section === 'copy' && state.currentCopyId ? { copyId: state.currentCopyId } : {}) };
}
