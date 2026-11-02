import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TeacherWorkspaceNavigation } from '../../src/ui/components/TeacherWorkspaceNavigation.tsx';

describe('navigation entre la bibliothèque de devoirs et l’espace de correction', () => {
  it('permet de revenir à la bibliothèque depuis le fil d’Ariane', () => {
    const html = renderToStaticMarkup(createElement(TeacherWorkspaceNavigation, {
      assignmentTitle: 'Devoir de biologie',
      studentLabel: '',
      activeSection: 'copies',
      showCopyRail: false,
      copies: [],
      activeCopyId: null,
      aiConfigured: true,
      settingsExpanded: false,
      isAnalyzing: false,
      processingStatus: 'Correction sur cet ordinateur',
      processingDetail: 'Vos copies restent sur votre serveur',
      onBackToAssignments: vi.fn(),
      onSelectCopies: vi.fn(),
      onSelectRubric: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenCopy: vi.fn(),
      canOpenNextReviewCopy: false,
      nextReviewCopyLabel: null,
      onOpenNextReviewCopy: vi.fn(),
    }));
    expect(html).toContain('Mes devoirs');
    expect(html).toContain('Devoir de biologie');
    expect(html).toContain('Fil d’Ariane');
  });

  it('expose les deux espaces fonctionnels sans navigation en étapes', () => {
    const html = renderToStaticMarkup(createElement(TeacherWorkspaceNavigation, {
      assignmentTitle: 'Devoir de biologie',
      studentLabel: '',
      activeSection: 'rubric',
      showCopyRail: false,
      copies: [],
      activeCopyId: null,
      aiConfigured: false,
      settingsExpanded: false,
      isAnalyzing: false,
      processingStatus: 'Correction sur cet ordinateur',
      processingDetail: 'Vos copies restent sur votre serveur',
      onBackToAssignments: vi.fn(),
      onSelectCopies: vi.fn(),
      onSelectRubric: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenCopy: vi.fn(),
      canOpenNextReviewCopy: false,
      nextReviewCopyLabel: null,
      onOpenNextReviewCopy: vi.fn(),
    }));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('Barème');
    expect(html).toContain('Copies');
    expect(html).toContain('IA locale à configurer');
    expect(html).not.toContain('teacher-step-nav');
  });
});
