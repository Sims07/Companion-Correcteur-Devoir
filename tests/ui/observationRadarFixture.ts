import type { DiagramLabArchiveEntry, DiagramLabProtocol } from '../../src/evaluation/domain/diagramLabHistory.ts';
import { DIAGRAM_SENSITIVITY_CASES } from '../../src/evaluation/domain/scientificDiagramSensitivity.ts';
import { SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET } from '../../src/evaluation/domain/scientificDiagramFixtures.ts';

export function radarSample(protocol: Exclude<DiagramLabProtocol, 'personal'>, repetitions: number, model = 'qwen:4b', profileId = 'profile-q', profileName = 'Qwen Vision'): DiagramLabArchiveEntry {
  const fixture = protocol === 'reference' || protocol === 'arrows';
  const ids = protocol === 'reference' ? ['A', 'B', 'C'] : protocol === 'arrows' ? ['D', 'E']
    : DIAGRAM_SENSITIVITY_CASES.map((item) => item.id);
  const cases = ids.map((id) => {
    const gold = fixture ? protocol === 'reference' ? { 'structure::visible': 'present', 'understanding::phase': 'present' }
      : { [SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET]: id === 'D' ? 'present' : 'absent' }
      : DIAGRAM_SENSITIVITY_CASES.find((item) => item.id === id)?.gold ?? {};
    const experiments = Array.from({ length: repetitions }, (_, i) => ({
      profileId, profileName, model, repetition: i + 1,
      status: 'success', method: 'direct-image-generative', durationMs: 37_000_000, providerDurationMs: 60_000,
      ...(protocol === 'graph' ? { zoom: false, observations: { ...gold } }
        : { observations: Object.entries(gold).map(([key, choice]) => ({ key, choice })) }),
    }));
    return { caseId: id, gold, experiments, label: id, summaries: [], ...(protocol === 'semantic' ? { promptMode: 'standard' } : {}) };
  });
  const createdAt = '2026-11-11T12:00:00Z';
  return {
    id: model + ':' + protocol + ':' + repetitions, protocol, createdAt, savedAt: createdAt, state: 'finished',
    title: protocol, plannedRepetitions: repetitions, profiles: ['Qwen Vision'],
    experimentCount: ids.length * repetitions, successfulCount: ids.length * repetitions, localOnly: true,
    report: {
      format: fixture ? 'companion-scientific-diagram-fixture-report'
        : protocol === 'semantic' ? 'companion-scientific-diagram-sensitivity-report' : 'companion-scientific-diagram-blind-graph-report',
      promptVariant: 'baseline', promptModes: ['standard'], createdAt, plannedRepetitions: repetitions,
      localOnly: true, cases, statistics: [], summaries: [], experiments: [],
    } as unknown as DiagramLabArchiveEntry['report'],
  };
}
