import { describe, expect, it } from 'vitest';
import { buildBlindVisualObservationReport } from '../../src/evaluation/domain/scientificDiagramBlindGraph.ts';
import { describeDiagramCampaign } from '../../src/evaluation/domain/diagramCampaignVerdict.ts';
import { summarizeDiagramLabReport } from '../../src/evaluation/domain/diagramLabHistory.ts';
import { DIAGRAM_SENSITIVITY_CASES, DIAGRAM_SENSITIVITY_TARGETS } from '../../src/evaluation/domain/scientificDiagramSensitivity.ts';

function graphEntry(indeterminate = false) {
  const runs = DIAGRAM_SENSITIVITY_CASES.map((item) => {
    const observations: Record<string, 'present' | 'absent' | 'partial' | 'uncertain'> = { ...item.gold };
    if (indeterminate && item.id === 'S0') {
      observations[DIAGRAM_SENSITIVITY_TARGETS.transcription] = 'uncertain';
      observations[DIAGRAM_SENSITIVITY_TARGETS.translation] = 'uncertain';
    }
    if (indeterminate && item.id === 'S3') {
      observations[DIAGRAM_SENSITIVITY_TARGETS.nucleus] = 'uncertain';
    }
    return {
      caseId: item.id, profileId: 'qwen', profileName: 'Qwen', model: 'qwen:4b',
      repetition: 1, status: 'success' as const, durationMs: 1000, observations,
      arrowCount: 2, containmentCount: 1,
    };
  });
  return summarizeDiagramLabReport(buildBlindVisualObservationReport(
    runs, 1, '2026-11-15T19:00:00Z', 'pixel-arrows',
  ), 'finished');
}

describe('scientific campaign verdict', () => {
  it('does not mistake six successful AI responses for a measurable graph score', () => {
    const entry = graphEntry(true);
    const verdict = describeDiagramCampaign(entry);
    expect(verdict.battery).toContain('Graphe des relations');
    expect(verdict.axisId).toBe('relations');
    expect(verdict.axisLabel).toBe('Lecture des relations');
    expect(verdict.passageStatus).toContain('6/6 passages exploitables');
    expect(verdict.scores).toEqual([expect.objectContaining({ profile: 'Qwen', value: null })]);
    expect(verdict.measured).toBe(false);
    expect(verdict.conclusion).toContain('non mesuré');
    expect(verdict.explanation).toContain('ne mesure pas la qualité graphique A/B/C');
  });

  it('displays real validated relation scores without borrowing graphics A/B/C', () => {
    const verdict = describeDiagramCampaign(graphEntry());
    expect(verdict.scores).toEqual([expect.objectContaining({ profile: 'Qwen', value: 100 })]);
    expect(verdict.measured).toBe(true);
    expect(verdict.axisId).toBe('relations');
    expect(verdict.conclusion).toContain('cette campagne uniquement');
  });

  it('distinguishes a graphical A/B/C battery and an unfinished battery', () => {
    const entry = graphEntry();
    const pending = describeDiagramCampaign({ ...entry, protocol: 'reference', state: 'running' });
    expect(pending.axisId).toBe('graphics');
    expect(pending.battery).toContain('Qualité graphique');
    expect(pending.measured).toBe(false);
    expect(pending.conclusion).toContain('avant la fin');
    const legacy = describeDiagramCampaign({ ...entry, protocol: 'personal' });
    expect(legacy.axisId).toBeNull();
    expect(legacy.scores).toEqual([]);
    expect(legacy.measured).toBe(false);
  });
});
