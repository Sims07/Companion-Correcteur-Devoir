import { describe, expect, it } from 'vitest';
import { recordedRadarBatteryEngines } from '../../src/domain/radarTimeline.ts';
import type { DiagramLabArchiveEntry } from '../../src/domain/diagramLabHistory.ts';

describe('actual engines recorded in radar campaign history', () => {
  it('keeps direct generative grading separate from the #439 graph reader and ignores other models', () => {
    // Synthetic report fragments: no student document or personal data.
    const entries = [
      {
        protocol: 'reference', title: 'Qualité graphique A/B/C',
        report: {
          format: 'companion-scientific-diagram-fixture-report',
          cases: [{ experiments: [
            { model: 'qwen:4b', method: 'direct-image-generative' },
            { model: 'other:4b', method: 'direct-image-systemone' },
          ] }],
        },
      },
      {
        protocol: 'graph', title: 'Graphe des relations S0–S5',
        report: {
          format: 'companion-scientific-diagram-blind-graph-report', promptVariant: 'pixel-arrows',
          cases: [{ experiments: [{ model: 'qwen:4b' }] }],
        },
      },
    ] as unknown as DiagramLabArchiveEntry[];
    expect(recordedRadarBatteryEngines(entries, 'qwen:4b')).toEqual([
      { protocol: 'Qualité graphique A/B/C', engine: 'Image → génératif direct' },
      { protocol: 'Graphe des relations S0–S5', engine: 'Extraction de graphe · pixel-arrows' },
    ]);
    expect(recordedRadarBatteryEngines(entries, 'absent:4b')).toEqual([]);
  });
});
