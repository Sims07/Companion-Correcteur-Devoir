// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { TimelinePoint } from '../../src/domain/radarTimeline.ts';
import { RadarTimeline } from '../../src/ui/components/RadarTimeline.tsx';

it('connects consecutive scores, marks protocol changes and breaks the line at a missing score', async () => {
  const scores = [0, 60, 80, null, 30];
  const points:TimelinePoint[] = scores.map((score, i) => ({
    id:String(i), date:'2026-11-14T10:00:00Z', model:'q', label:'Méthode '+i,
    prompts:[], score, axes:{Flèches:score}, comparisonBasis:i<2?'A':'B',
  }));
  const node = document.createElement('div');
  const root = createRoot(node);
  await act(async () => root.render(createElement(RadarTimeline, {model:'q', points, domainLabel:'Schémas',
    children:null, onBack:vi.fn(), onExport:vi.fn(), selectMethod:vi.fn()})));
  const segments = [...node.querySelectorAll('.trend-segment')];
  expect(segments).toHaveLength(2);
  expect(segments.map(line => line.hasAttribute('stroke-dasharray')).sort()).toEqual([false,true]);
  const markers = node.querySelectorAll<HTMLButtonElement>('.trend-point');
  expect(markers).toHaveLength(4);
  const zero = [...markers].find(button => button.getAttribute('aria-label')?.includes('Méthode 0'))!;
  await act(async () => zero.click());
  expect(node.querySelector('.trend-selection')?.textContent).toContain('0 / 100');
  expect(zero.getAttribute('aria-pressed')).toBe('true');
  await act(async () => root.unmount());
});
