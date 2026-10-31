import { describe, expect, it } from 'vitest';
import { annotateNetworkRequest, copyNetworkRequestMetadata, getNetworkRequestMetadata } from '../src/ports/networkRequestMetadata.ts';
describe('network request metadata', () => {
  it('attaches intent and context without changing HTTP headers or payload', () => {
    const init = annotateNetworkRequest({ method: 'POST', body: '{"copy":"local"}' }, 'Enregistrer une copie', 'Copie TP1');
    expect(getNetworkRequestMetadata(init)).toEqual({ intent: 'Enregistrer une copie', context: 'Copie TP1' });
    expect(init).toEqual({ method: 'POST', body: '{"copy":"local"}' });
  });
  it('trims values and supplies a fallback for an empty intent', () => {
    const init = annotateNetworkRequest({}, '  ', '  ');
    expect(getNetworkRequestMetadata(init)).toEqual({ intent: 'Intention non renseignée' });
  });
  it('propagates metadata through a translated transport request', () => {
    const source = annotateNetworkRequest({ method: 'POST' }, 'Lire et transcrire une page', 'Copie A · page 2/3');
    const target = copyNetworkRequestMetadata(source, { method: 'POST', body: '{}' });
    expect(getNetworkRequestMetadata(target)).toEqual(getNetworkRequestMetadata(source));
  });
  it('does not invent metadata for unannotated requests', () => {
    expect(getNetworkRequestMetadata({ method: 'GET' })).toBeUndefined();
  });
});
