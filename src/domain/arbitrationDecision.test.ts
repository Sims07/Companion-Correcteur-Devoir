import { describe, expect, it } from 'vitest';
import { parseArbitrationDecisions } from './arbitrationDecision.ts';

const first = [{ criterionId: 'q1', points: 2 }, { criterionId: 'q2', points: 1 }];
const second = [{ criterionId: 'q1', points: 4 }, { criterionId: 'q2', points: 3 }];

describe('parseArbitrationDecisions', () => {
  it('accepts a compact decision contract selecting one existing opinion per disputed criterion', () => {
    expect(parseArbitrationDecisions(JSON.stringify({ decisions: [
      { criterionId: 'q1', selected: 'avis2', reason: 'Le deuxième avis suit mieux le barème.' },
      { criterionId: 'q2', selected: 'avis1', reason: 'La preuve ne justifie pas les points supplémentaires.' },
    ] }), ['q1', 'q2'], first, second)).toEqual([
      { criterionId: 'q1', selected: 'avis2', reason: 'Le deuxième avis suit mieux le barème.' },
      { criterionId: 'q2', selected: 'avis1', reason: 'La preuve ne justifie pas les points supplémentaires.' },
    ]);
  });

  it('rejects a full correction payload instead of judge decisions', () => {
    expect(() => parseArbitrationDecisions(JSON.stringify({ finalScore: 20, criteria: [] }), ['q1'], first, second))
      .toThrow('tableau decisions exploitable');
  });

  it('rejects missing or duplicated disputed criteria', () => {
    const missing = JSON.stringify({ decisions: [{ criterionId: 'q1', selected: 'avis1', reason: 'raison' }] });
    expect(() => parseArbitrationDecisions(missing, ['q1', 'q2'], first, second)).toThrow('exactement une décision');
    const duplicate = JSON.stringify({ decisions: [
      { criterionId: 'q1', selected: 'avis1', reason: 'raison' },
      { criterionId: 'q1', selected: 'avis2', reason: 'raison bis' },
    ] });
    expect(() => parseArbitrationDecisions(duplicate, ['q1', 'q2'], first, second)).toThrow('plusieurs décisions');
  });

  it('rejects invented criterion ids and extra fields', () => {
    expect(() => parseArbitrationDecisions(JSON.stringify({ decisions: [
      { criterionId: 'invented', selected: 'avis1', reason: 'raison' },
    ] }), ['invented'], first, second)).toThrow('critère inconnu');
    expect(() => parseArbitrationDecisions(JSON.stringify({ decisions: [
      { criterionId: 'q1', selected: 'avis1', reason: 'raison' },
    ], finalScore: 99 }), ['q1'], first, second)).toThrow('champs hors du contrat');
  });
});
