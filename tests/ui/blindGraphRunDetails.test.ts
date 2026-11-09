// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BlindGraphRunDetails } from '../../src/ui/components/BlindGraphRunDetails.tsx';
import type { BlindVisualObservationRun } from '../../src/domain/scientificDiagramBlindGraph.ts';

const run: BlindVisualObservationRun = {
  caseId: 'S0', repetition: 1, profileId: 'local', profileName: 'Qwen', model: 'qwen', durationMs: 1200,
  status: 'success', observations: { 'relations::transcription': 'uncertain' }, arrowCount: 1, containmentCount: 0,
  graph: { labels: ['ADN', 'ARN'], arrows: [{ first: 'ADN', second: 'ARN', tip: 'none' }], containment: [], arrowsComplete: true },
  relationDetails: { 'relations::transcription': { choice: 'uncertain', reason: 'unclear-tip' } },
  diagnostic: { rawResponse: '<script>alert(1)</script>', rawResponseTruncated: false, doneReason: 'length', outputTokens: 768 },
};
function render(value = run, gold: Record<string, import('../../src/domain/scientificDiagramSensitivity.ts').DiagramSensitivityChoice> = { 'relations::transcription': 'present' }) {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(createElement(BlindGraphRunDetails, { run: value, gold }));
  return container;
}
describe('diagnostic lisible du graphe', () => {
  it('shows reference, observed uncertainty, comparator reason, graph and bounded raw output as inert text', () => {
    const container = render();
    expect(container.textContent).toContain('Sortie valide');
    expect(container.textContent).toContain('Indécidable');
    expect(container.textContent).toContain('Trait sans pointe');
    expect(container.textContent).toContain('ADN → ARN');
    expect(container.textContent).toContain('limite de génération');
    expect(container.querySelectorAll('pre')[0]?.textContent).toContain('arrowsComplete');
    expect(container.querySelectorAll('pre')[1]?.textContent).toBe('<script>alert(1)</script>');
    expect(container.querySelector('script')).toBeNull();
  });
  it('shows zoom outcome counts without exposing the crop pixels', () => {
    const container = render({ ...run, zoom: true, diagnostic: { ...run.diagnostic!,
      zoom: { candidates: 2, attempted: 1, resolved: 1, unavailable: 1, failures: 0 },
    } });
    expect(container.textContent).toContain('Agrandissement ciblé : 1 tentative(s)');
    expect(container.textContent).toContain('1 direction(s) clarifiée(s)');
    expect(container.textContent).toContain('1 zone(s) non localisée(s)');
  });
  it('distinguishes missing reference from a negative and displays rejection diagnostics', () => {
    expect(render(run, {}).textContent).toContain('Non définie');
    const failed = render({ ...run, status: 'failed', graph: undefined, observations: {}, relationDetails: undefined,
      diagnostic: { rawResponse: '{', rawResponseTruncated: true, validationError: 'JSON visuel illisible.' } });
    expect(failed.textContent).toContain('Sortie rejetée : JSON visuel illisible.');
    expect(failed.textContent).toContain('24 000');
    expect(failed.querySelector('table')).toBeNull();
    expect(failed.textContent).not.toContain('Graphe extrait');
  });
});
