// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { DiagramLabArchiveEntry } from '../../../src/evaluation/domain/diagramLabHistory.ts';
import type { BiologyRadarObservation } from '../../../src/evaluation/domain/biologyTeacherRadar.ts';
import type { TimelinePoint } from '../../../src/evaluation/domain/radarTimeline.ts';
import {
  activeBiologyObservations, activeScienceEntries, activeTimelinePoints,
  loadRadarMethodExclusions, methodIsActive, observedRadarMethodId, parseRadarMethodExclusions,
  saveRadarMethodExclusions, timelineMethodId, toggleRadarMethodExclusion,
} from '../../../src/evaluation/domain/radarMethodExclusions.ts';

afterEach(() => window.localStorage.removeItem('companion:radar-method-exclusions:v1'));

describe('reversible, persisted method exclusions', () => {
  it('rejects invalid stored method IDs and returns empty defaults for invalid JSON', () => {
    expect(parseRadarMethodExclusions({
      diagrams: ['pixel-v1', 'fake', 'pixel-v1', 18],
      biology: ['contract', 'unknown', null],
    })).toEqual({ diagrams: ['pixel-v1'], biology: ['contract'] });
    window.localStorage.setItem('companion:radar-method-exclusions:v1', '{');
    expect(loadRadarMethodExclusions()).toEqual({ diagrams: [], biology: [] });
  });

  it('persists exclusions per radar domain and allows restoring one method without touching others', () => {
    const empty = parseRadarMethodExclusions({});
    const excluded = toggleRadarMethodExclusion(
      toggleRadarMethodExclusion(empty, 'diagrams', 'pixel-v1'), 'biology', 'standard');
    expect(methodIsActive(excluded, 'diagrams', 'pixel-v1')).toBe(false);
    expect(methodIsActive(excluded, 'biology', 'contract')).toBe(true);
    expect(toggleRadarMethodExclusion(excluded, 'biology', 'invented')).toBe(excluded);
    expect(saveRadarMethodExclusions(excluded)).toBe(true);
    expect(loadRadarMethodExclusions()).toEqual(excluded);
    expect(toggleRadarMethodExclusion(excluded, 'diagrams', 'pixel-v1')).toEqual({
      diagrams: [], biology: ['standard'],
    });
  });

  it('filters only active evidence and trends, preserving original scientific and biology archives', () => {
    const exclusions = { diagrams: ['pixel-v1' as const], biology: ['contract' as const] };
    const scientific = [
      { id: 'excluded', trial: { method: 'pixel-v1' } },
      { id: 'active', trial: { method: 'guided-v1' } },
      { id: 'legacy' },
    ] as unknown as DiagramLabArchiveEntry[];
    const biology = [
      { id: 'excluded', protocol: 'contract' },
      { id: 'active', protocol: 'standard' },
    ] as BiologyRadarObservation[];
    const points = [
      { id: 'excluded', scienceMethod: 'pixel-v1' },
      { id: 'active', scienceMethod: 'guided-v1' },
      { id: 'legacy' },
    ] as TimelinePoint[];

    expect(activeScienceEntries(scientific, exclusions).map(row => row.id)).toEqual(['active', 'legacy']);
    expect(activeBiologyObservations(biology, exclusions).map(row => row.id)).toEqual(['active']);
    expect(activeTimelinePoints(points, 'diagrams', exclusions).map(row => row.id)).toEqual(['active', 'legacy']);
    expect(activeTimelinePoints([
      { id: 'pilot', label: 'Pilote · génératif' },
      { id: 'contract', biologyMethod: 'contract' },
    ] as TimelinePoint[], 'biology', exclusions).map(row => row.id)).toEqual(['pilot']);
    expect(scientific).toHaveLength(3);
    expect(biology).toHaveLength(2);
    expect(points).toHaveLength(3);
  });
});

describe('observed method names, distinct from launch strategies', () => {
  it('keeps old strategy exclusions and permits persistent exclusions for archived labels', () => {
    const legacy = observedRadarMethodId('diagrams', 'Image → génératif direct');
    const variant = observedRadarMethodId('biology', 'Contrats par question · generative · ollama');
    const initial = parseRadarMethodExclusions({ diagrams: ['pixel-v1', legacy], biology: [variant] });
    expect(initial).toEqual({ diagrams: ['pixel-v1', legacy], biology: [variant] });
    expect(saveRadarMethodExclusions(initial)).toBe(true);
    expect(loadRadarMethodExclusions()).toEqual(initial);
    expect(parseRadarMethodExclusions({ diagrams: ['historique:', 'historique:bad\\nname'],
      biology: ['variante:', 'other', variant] })).toEqual({ diagrams: [], biology: [variant] });
    expect(timelineMethodId('diagrams', { label: 'Image → génératif direct' } as TimelinePoint)).toBe(legacy);
  });

  it('excludes only the selected observed biology variant while respecting older protocol exclusions', () => {
    const generative = {
      id: 'g', protocol: 'contract', method: 'generative', provider: 'ollama',
    } as BiologyRadarObservation;
    const decision = { ...generative, id: 'd', method: 'decision' };
    const variant = observedRadarMethodId('biology', 'Contrats par question · generative · ollama');
    const excluded = { diagrams: [], biology: [variant] };
    expect(activeBiologyObservations([generative, decision], excluded).map(row => row.id)).toEqual(['d']);
    expect(activeTimelinePoints([
      { id: 'g', label: 'Contrats par question · generative · ollama', biologyMethod: 'contract' },
      { id: 'd', label: 'Contrats par question · decision · ollama', biologyMethod: 'contract' },
    ] as TimelinePoint[], 'biology', excluded).map(row => row.id)).toEqual(['d']);
    expect(activeBiologyObservations([generative, decision], { diagrams: [], biology: ['contract'] })).toEqual([]);
    expect(toggleRadarMethodExclusion(excluded, 'biology', variant)).toEqual({ diagrams: [], biology: [] });
  });
});
