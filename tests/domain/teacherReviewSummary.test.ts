import { describe, expect, it } from 'vitest';
import { summarizeTeacherReason, teacherReviewStatus } from '../../src/domain/teacherReviewSummary.ts';

describe('résumé de revue pour le professeur', () => {
  it('affiche uniquement la première phrase décisive sans exposer un long rapport', () => {
    expect(summarizeTeacherReason('Mécanisme de division absent. Explication très longue qui dépasse la lecture utile.'))
      .toBe('Mécanisme de division absent.');
  });

  it('plafonne le texte visible à 18 mots tout en conservant le détail ailleurs', () => {
    const words = Array.from({ length: 25 }, (_, i) => 'mot' + i).join(' ');
    const compact = summarizeTeacherReason(words);
    expect(compact).toMatch(/…$/);
    expect(compact.replace(/…$/, '').split(' ')).toHaveLength(18);
    expect(compact).not.toContain('mot24');
  });

  it('ne crée pas de faux motif lorsque la justification est vide', () => {
    expect(summarizeTeacherReason(' \n ')).toBe('Justification non fournie.');
    expect(summarizeTeacherReason('  Note   argumentée.  ')).toBe('Note argumentée.');
  });

  it('ne prétend pas que tous les critères nécessitent une confirmation', () => {
    expect(teacherReviewStatus(0, 0)).toBe('Tous les critères sont notés');
    expect(teacherReviewStatus(0, 2)).toBe('2 point(s) signalé(s) à examiner');
    expect(teacherReviewStatus(1, 2)).toBe('1 critère(s) à noter manuellement');
  });
});
