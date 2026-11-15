import { expect, it, vi } from 'vitest';
import { reportGradingOutcome } from '../../src/correction/application/reportGradingOutcome.ts';

const rubric = { title: 'Mitose', criteria: [{ id: 'cell', title: 'Cellule', description: '', maxPoints: 2 }] };

it('reports an unreadable response once without including the raw text or transcription', () => {
  const subscriber = vi.fn();
  reportGradingOutcome('réponse brute invalide', rubric, 'transcription privée', subscriber);
  expect(subscriber.mock.calls).toEqual([[{ type: 'correction.response-rejected' }]]);
});

it('propagates delivery failures without publishing a second outcome', () => {
  const subscriber = vi.fn(() => { throw new Error('échec de livraison'); });
  expect(() => reportGradingOutcome('{}', rubric, undefined, subscriber)).toThrow('échec de livraison');
  expect(subscriber).toHaveBeenCalledTimes(1);
});
