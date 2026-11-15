import { expect, it } from 'vitest';
import { radarMethodDecision } from '../../../src/evaluation/domain/radarMethodDecision.ts';
import type { TimelinePoint } from '../../../src/evaluation/domain/radarTimeline.ts';

function run(label: string, score: number, day: number, overrides: Partial<TimelinePoint> = {}): TimelinePoint {
  return { label, score, date: '2026-11-' + day, model: 'Qwen', id: label + day, revision: 'v1',
    prompts: [], axes: { Flèches: score, Relations: score }, comparisonBasis: 'reference A', ...overrides };
}

it('keeps partial and differently weighted scores out of the choice', () => {
  const rows = [run('Petites pointes', 80, 15), run('Longs traits', 78, 14),
    run('Partiel', 98, 16, {axes: {Flèches: null, Relations: 98}}),
    run('Autres poids', 100, 13, {comparisonBasis: 'reference B'})];
  const verdict = radarMethodDecision(rows);
  expect(verdict.title).toContain('Petites pointes');
  expect(verdict.detail).toContain('+2 point(s)');
  expect(verdict.detail).toContain('Flèches');
  expect(radarMethodDecision(rows.slice(2)).title).toBe('Choix encore ouvert');
});

it('reports overlapping repeat scores and distinguishes an older revision', () => {
  const rows = [run('A', 85, 15), run('B', 81, 14)];
  expect(radarMethodDecision([...rows, run('A', 80, 13)]).title).toContain('coude-à-coude');
  expect(radarMethodDecision([...rows, run('A', 80, 13, {revision:'older'})]).title).toContain('recommandée');
  expect(radarMethodDecision([run('A', 80, 15), run('B', 80, 14)]).title).toContain('coude-à-coude');
});

it('names the missing measurement and refuses an unknown comparison basis', () => {
  expect(radarMethodDecision([run('A', 91, 15, {axes:{Flèches: 91, Relations: null}})]).detail).toContain('À mesurer : Relations');
  expect(radarMethodDecision([run('A', 90, 15, {comparisonBasis:undefined}), run('B', 80, 15)]).title).toBe('Choix encore ouvert');
});
