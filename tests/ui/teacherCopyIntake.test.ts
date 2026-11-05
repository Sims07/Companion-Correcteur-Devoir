import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TeacherCopyIntake } from '../../src/ui/components/TeacherCopyIntake.tsx';

const props = {
  grouping: 'each-file' as const,
  onGroupingChange: () => undefined,
  studentLabel: '',
  onStudentLabelChange: () => undefined,
  hasTeacherAnnotations: false,
  onTeacherAnnotationsChange: () => undefined,
  onFilesSelected: () => undefined,
  onClose: () => undefined,
  onOpenDetailedCopy: () => undefined,
  busy: false,
  rubricReady: true,
};

describe('ajout de copies pour le professeur', () => {
  it('explique le regroupement sans faire choisir une correction individuelle ou en série', () => {
    const html = renderToStaticMarkup(createElement(TeacherCopyIntake, props));
    expect(html).toContain('Un fichier par copie');
    expect(html).toContain('Plusieurs fichiers pour une copie');
    expect(html).toContain('Chaque fichier est une copie');
    expect(html).not.toContain('traitement séquentiel');
    expect(html).not.toContain('Nom de l’étudiant (facultatif)');
  });
  it('affiche le nom facultatif pour une copie multipages et les options d’annotations', () => {
    const html = renderToStaticMarkup(createElement(TeacherCopyIntake, { ...props, grouping: 'group-files' }));
    expect(html).toContain('teacher-intake-student-name');
    expect(html).toContain('Les fichiers sélectionnés formeront une seule copie');
    expect(html).toContain('Options pour les copies annotées');
  });
  it('empêche l’import tant que le barème est incomplet', () => {
    const html = renderToStaticMarkup(createElement(TeacherCopyIntake, { ...props, rubricReady: false }));
    expect(html).toContain('Complétez le barème');
    expect(html).toContain('ds-status-notice--warning');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('teacher-copy-intake-files');
  });
});
