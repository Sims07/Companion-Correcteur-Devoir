import { describe, expect, it } from 'vitest';
import { duplicateAssignmentProfile, previewReusableCriteria, reuseSelectedCriteria } from '../../src/domain/teacherWorkflow.ts';
import type { Rubric } from '../../src/domain/rubric.ts';

const source: Rubric = { title: 'Mitose', criteria: [
  { id: 'a', title: 'Phases', description: 'Énumérer les phases', maxPoints: 4, subcriteria: [
    { id: 's1', title: 'Prophase', description: '', maxPoints: 2 },
    { id: 's2', title: 'Anaphase', description: '', maxPoints: 2 },
  ] },
  { id: 'b', title: 'Schéma', description: 'Légendes', maxPoints: 3, analysisMode: 'scientific-diagram' },
] };
const target: Rubric = { title: 'Autre devoir', criteria: [
  { id: 't', title: 'Connaissances', description: '', maxPoints: 2 },
] };
const idFactory = () => {
  let next = 0;
  return (kind: 'criterion' | 'subcriterion') => kind + '-' + ++next;
};

describe('réutilisation locale des barèmes', () => {
  it('affiche les nouveaux critères et conserve les attendus, points, modes et sous-critères', () => {
    expect(previewReusableCriteria(source, target).map((item) => item.status)).toEqual(['new', 'new']);
    const reused = reuseSelectedCriteria(source, target, ['a', 'b'], idFactory());
    expect(reused.map((item) => item.title)).toEqual(['Phases', 'Schéma']);
    expect(reused[0].subcriteria?.map((item) => item.maxPoints)).toEqual([2, 2]);
    expect(reused[1].analysisMode).toBe('scientific-diagram');
    expect(reused[0].id).not.toBe('a');
    expect(reused[0].subcriteria?.[0]?.id).not.toBe('s1');
    reused[0].subcriteria![0]!.title = 'Modifié';
    expect(source.criteria[0].subcriteria?.[0]?.title).toBe('Prophase');
    expect(target.criteria).toHaveLength(1);
  });

  it('identifie et refuse les doublons exacts, sans toucher au barème existant', () => {
    const withDuplicate: Rubric = { ...target, criteria: [...target.criteria, structuredClone(source.criteria[0])] };
    expect(previewReusableCriteria(source, withDuplicate)[0].status).toBe('duplicate');
    expect(() => reuseSelectedCriteria(source, withDuplicate, ['a'], idFactory())).toThrow(/identique/);
  });

  it('ne déduit pas les points et refuse les critères invalides ou les choix inconnus', () => {
    const invalid: Rubric = { title: 'Invalide', criteria: [{ ...source.criteria[0], maxPoints: 5 }] };
    expect(() => previewReusableCriteria(invalid, target)).toThrow(/totalisent/);
    expect(() => reuseSelectedCriteria(source, target, ['inconnu'], idFactory())).toThrow(/absent/);
    expect(() => reuseSelectedCriteria(source, target, ['a', 'a'], idFactory())).toThrow(/double/);
    expect(() => reuseSelectedCriteria(source, target, ['a'], () => 'a')).toThrow(/non unique/);
  });

  it('migre les anciens éléments attendus en sous-critères indépendants', () => {
    const legacy: Rubric = { title: 'Ancien', criteria: [{ id: 'legacy', title: 'Ancien schéma', description: '', maxPoints: 3, expectedElements: [{ label: 'Noyau', points: 3 }] }] };
    const copied = reuseSelectedCriteria(legacy, target, ['legacy'], idFactory())[0];
    expect(copied.expectedElements).toBeUndefined();
    expect(copied.subcriteria).toEqual([{ id: 'subcriterion-2', title: 'Noyau', description: '', maxPoints: 3 }]);
  });
});

describe('duplication de devoir', () => {
  it('duplique le contenu du devoir sans partager les objets ni les copies archivées', () => {
    const assignment = { id: 'origin', title: ' Mitose ', description: 'L1', educationLevel: 'Université — Licence 1', question: 'Question', rubric: source };
    const copied = duplicateAssignmentProfile(assignment, 'nouveau');
    expect(copied).toMatchObject({ id: 'nouveau', title: 'Mitose — copie', description: 'L1', question: 'Question' });
    copied.rubric.criteria[0].title = 'Différent';
    expect(assignment.rubric.criteria[0].title).toBe('Phases');
    expect(() => duplicateAssignmentProfile(assignment, 'origin')).toThrow(/distinct/);
  });
});
