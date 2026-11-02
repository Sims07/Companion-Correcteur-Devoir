import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TeacherWorkspaceNavigation } from '../../src/ui/components/TeacherWorkspaceNavigation.tsx';

const callbacks = {
  onBackToAssignments: vi.fn(),
  onSelectCopies: vi.fn(),
  onSelectRubric: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenCopy: vi.fn(),
  canOpenNextReviewCopy: false,
  nextReviewCopyLabel: null,
  onOpenNextReviewCopy: vi.fn(),
};

describe('navigation de l’espace enseignant', () => {
  it('présente le fil d’Ariane et les onglets Copies / Barème sans navigation en étapes', () => {
    const html = renderToStaticMarkup(createElement(TeacherWorkspaceNavigation, {
      assignmentTitle: 'Biologie cellulaire',
      studentLabel: 'Marie Dupont',
      activeSection: 'copies',
      showCopyRail: false,
      copies: [],
      activeCopyId: null,
      aiConfigured: true,
      settingsExpanded: false,
      isAnalyzing: false,
      processingStatus: 'Correction sur cet ordinateur',
      processingDetail: 'Vos copies restent sur votre serveur',
      ...callbacks,
    }));

    expect(html).toContain('aria-label="Fil d’Ariane"');
    expect(html).toContain('Biologie cellulaire');
    expect(html).toContain('class="teacher-breadcrumb-assignment"');
    expect(html).toContain('aria-label="Sections du devoir"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('Copies');
    expect(html).toContain('Barème');
    expect(html).toContain('Réglages de l’IA locale');
    expect(html).not.toContain('Étapes du devoir');
  });

  it('affiche un état de configuration requis et un rail repliable avec la copie active', () => {
    const html = renderToStaticMarkup(createElement(TeacherWorkspaceNavigation, {
      assignmentTitle: 'Biologie cellulaire',
      studentLabel: 'Marie Dupont',
      activeSection: 'copies',
      showCopyRail: true,
      copies: [{ id: 'copy-1', label: 'Marie Dupont', status: 'À vérifier', score: '14,5 / 20' }],
      activeCopyId: 'copy-1',
      aiConfigured: false,
      settingsExpanded: false,
      isAnalyzing: false,
      processingStatus: 'Correction sur cet ordinateur',
      processingDetail: 'Vos copies restent sur votre serveur',
      ...callbacks,
    }));

    expect(html).toContain('IA locale à configurer');
    expect(html).toContain('aria-label="Navigation entre les copies"');
    expect(html).toContain('Réduire la liste des copies');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Marie Dupont');
    expect(html).toContain('<strong aria-current="page">Marie Dupont</strong>');
    expect(html).not.toContain('<strong aria-current="page">Copies</strong>');
    expect(html).toContain('14,5 / 20');
    expect(html).toContain('À vérifier');
  });

  it('désactive les changements de section et de copie pendant une analyse', () => {
    const html = renderToStaticMarkup(createElement(TeacherWorkspaceNavigation, {
      assignmentTitle: 'Biologie cellulaire',
      studentLabel: 'Marie Dupont',
      activeSection: 'copies',
      showCopyRail: true,
      copies: [{ id: 'copy-1', label: 'Marie Dupont', status: 'Analyse en cours' }],
      activeCopyId: 'copy-1',
      aiConfigured: true,
      settingsExpanded: true,
      isAnalyzing: true,
      processingStatus: 'Lecture de la copie',
      processingDetail: '00:42 écoulées',
      ...callbacks,
    }));

    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('role="status"');
  });
});
