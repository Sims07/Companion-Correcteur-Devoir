import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TeacherWorkspaceNavigation } from '../../src/ui/components/TeacherWorkspaceNavigation.tsx';

const navigation = () => renderToStaticMarkup(createElement(TeacherWorkspaceNavigation, {
  assignmentTitle: 'Partiel de biologie cellulaire',
  studentLabel: 'Camille Bernard',
  educationLevel: 'Licence 2',
  maximumPoints: 20,
  activeSection: 'copies',
  showCopyRail: true,
  copies: [{ id: 'copy-1', label: 'Camille Bernard', status: 'À vérifier', score: '14,5 / 20' }],
  activeCopyId: 'copy-1',
  aiConfigured: true,
  settingsExpanded: false,
  isAnalyzing: false,
  processingStatus: 'Correction sur cet ordinateur',
  processingDetail: 'Fournisseur configuré',
  onBackToAssignments: () => undefined,
  onSelectCopies: () => undefined,
  onSelectRubric: () => undefined,
  onOpenSettings: () => undefined,
  onOpenCopy: () => undefined,
  canOpenNextReviewCopy: false,
  onOpenNextReviewCopy: () => undefined,
}));

describe('Atelier B : organisation réelle du poste enseignant', () => {
  it('gathers the assignment, actions, and copies in one persistent complementary rail', () => {
    const markup = navigation();
    expect(markup).toContain('class="atelier-assignment-sidebar"');
    expect(markup).toContain('aria-label="Navigation du devoir"');
    expect(markup).toContain('aria-label="Navigation entre les copies"');
    expect(markup).toContain('Partiel de biologie cellulaire');
    expect(markup).toContain('Camille Bernard');
    expect(markup).toContain('14,5 / 20');
  });

  it('keeps unique, accessible tabs and navigation while removing the second tab bar', () => {
    const markup = navigation();
    expect(markup).toContain('role="tablist" aria-label="Sections du devoir"');
    expect(markup).toContain('role="tab" aria-label="Barème"');
    expect(markup).toContain('role="tab" aria-label="Copies"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-label="Mes devoirs"');
    expect(markup).not.toContain('class="teacher-workspace-tabs"');
  });

  it('renders the same structure at wide and narrow widths without hiding the rail content', () => {
    const layout = readFileSync('src/ui/atelierBLayout.css', 'utf8');
    const entrypoint = readFileSync('src/main.tsx', 'utf8');
    expect(layout).toContain('grid-template-columns: 218px clamp(18px, 2.2vw, 34px) minmax(0, 1fr)');
    expect(layout).toContain('@media (max-width: 760px)');
    expect(layout).toContain('.atelier-sidebar-tabs');
    expect(layout).toContain('.atelier-review-decision-heading');
    expect(entrypoint.indexOf('./ui/atelierBLayout.css')).toBeGreaterThan(entrypoint.indexOf('./ui/correctionAtelier.css'));
    expect(layout).toContain('focus-visible');
    expect(layout).toContain('/* Atelier B reference: a quiet, single-row reading header, never a bordered card. */');
    expect(layout).toMatch(/\.teacher-flow-shell \.copy-review-header \{[\s\S]*?border: 0;/);
    expect(layout).toMatch(/\.teacher-flow-shell \.copy-review-header-main \{[\s\S]*?display: flex;/);
    expect(layout).toContain('.copy-review-header-actions');
    expect(layout).toContain('grid-template-columns: 16px minmax(0,1fr) 16px');
    expect(layout).toContain('body:has(.teacher-flow-shell .copy-review-validation-bar) .memory-fab');
    expect(layout).toContain('prefers-reduced-motion');
  });

  it('keeps grade and comment edits optional, not removed from correction', () => {
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).toContain('className="review-quick-edit"');
    expect(app).toContain('Ajuster la note ou ajouter un commentaire');
    expect(app).toContain('normalizeGradeScore(Number(event.target.value))');
    expect(app).toContain('className="review-controls"');
  });
});
