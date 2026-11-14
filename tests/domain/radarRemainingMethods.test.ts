import { describe, expect, it } from 'vitest';
import { RADAR_PRESETS } from '../../src/domain/diagramLabRadar.ts';
import type { DiagramLabArchiveEntry, DiagramLabProtocol } from '../../src/domain/diagramLabHistory.ts';
import type { BiologyRadarObservation } from '../../src/domain/biologyTeacherRadar.ts';
import { remainingBiologyMethods, remainingScienceMethods } from '../../src/domain/radarRemainingMethods.ts';
import { scienceMethods, type ScienceMethod } from '../../src/domain/radarTimeline.ts';

const testCases: Record<string, readonly string[]> = {
  reference: ['A', 'B', 'C'], arrows: ['D', 'E'],
  semantic: ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'], graph: ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'],
};

function entry(method: ScienceMethod, trialId: string, protocol: DiagramLabProtocol,
  { model = 'qwen:4b', missing = 0, repetitions = 1, state = 'finished' as const } = {}): DiagramLabArchiveEntry {
  const caseIds = testCases[protocol]!;
  const count = caseIds.length * repetitions - missing;
  return {
    id: trialId + ':' + protocol, protocol, createdAt: '2026-11-14T10:00:00Z',
    savedAt: '2026-11-14T10:00:00Z', state, title: protocol,
    profiles: [model], plannedRepetitions: repetitions, experimentCount: count,
    successfulCount: count, localOnly: true,
    trial: { id: trialId, method, weights: RADAR_PRESETS.balanced },
    report: {
      format: 'companion-scientific-diagram-fixture-report',
      cases: caseIds.map((caseId, index) => ({
        caseId, experiments: Array.from({length: Math.max(0, repetitions - (index === caseIds.length - 1 ? missing : 0))},
          () => ({model, status: 'success'})),
      })),
    } as unknown as DiagramLabArchiveEntry['report'],
  };
}

const allProtocols = ['reference', 'arrows', 'semantic', 'graph'] as const;

function observation(protocol: 'contract' | 'standard', caseId: string,
  profileId = 'profile-a', status = 'success'): BiologyRadarObservation {
  return {
    id: protocol + ':' + profileId + ':' + caseId, campaignId: protocol,
    profile: profileId, profileId, model: 'qwen:4b', provider: 'ollama',
    method: 'generative', protocol, caseId, recordedAt: '2026-11-14T10:00:00Z',
    status, score: 7, referenceScore: 7,
    decisions: Array.from({ length: 10 }, (_, index) => ({
      id: 'q' + index, expected: (index % 2) as 0 | 1, awarded: index % 2,
    })),
  };
}

describe('remaining radar methods', () => {
  it('skips only complete scientific trials of the selected model and does not combine partial trials', () => {
    const history = [
      ...allProtocols.map(protocol => entry('leaders-v1', 'full', protocol)),
      ...allProtocols.slice(0, 2).map(protocol => entry('pixel-v1', 'partial-a', protocol)),
      ...allProtocols.slice(2).map(protocol => entry('pixel-v1', 'partial-b', protocol)),
      ...allProtocols.map(protocol => entry('guided-v1', 'other-model', protocol, {model:'other:4b'})),
      ...allProtocols.map(protocol => entry('direct-v1', 'missing-case', protocol,
        protocol === 'arrows' ? { missing: 1 } : {})),
    ];
    expect(remainingScienceMethods(history, 'qwen:4b')).toEqual(
      (Object.keys(scienceMethods) as ScienceMethod[]).filter(m => m !== 'leaders-v1'));
    expect(remainingScienceMethods(history, 'other:4b')).not.toContain('guided-v1');
    expect(remainingScienceMethods(history, 'never-tested')).toHaveLength(5);
  });

  it('treats interrupted or incomplete batteries as remaining, including three-pass references', () => {
    const full = allProtocols.map(protocol => entry('pixel-v1', 'three', protocol,
      { repetitions: protocol === 'reference' ? 3 : 1 }));
    expect(remainingScienceMethods(full, 'qwen:4b')).not.toContain('pixel-v1');
    expect(remainingScienceMethods(
      [...full.slice(0, 1), entry('pixel-v1', 'three', 'arrows', {missing:1}), ...full.slice(2)],
      'qwen:4b')).toContain('pixel-v1');
    expect(remainingScienceMethods(
      full.map(item => item.protocol === 'graph' ? {...item, state:'running' as const} : item),
      'qwen:4b')).toContain('pixel-v1');
  });

  it('does not treat repeated successes of one drawing as completion of other drawings', () => {
    const full = allProtocols.map(protocol => entry('pixel-v1', 'complete', protocol));
    const broken = {...full[0]!, report: {
      ...full[0]!.report, cases: [
        {caseId:'A',experiments:[{model:'qwen:4b',status:'success'},{model:'qwen:4b',status:'success'},{model:'qwen:4b',status:'success'}]},
        {caseId:'B',experiments:[]}, {caseId:'C',experiments:[]},
      ],
    } as unknown as DiagramLabArchiveEntry['report']};
    expect(remainingScienceMethods([broken, ...full.slice(1)], 'qwen:4b')).toContain('pixel-v1');
  });

  it('skips a biology method only after the active profile has five measured axes', () => {
    const rows = ['A','B','C','D','E','F','G'].map(id => observation('contract', id));
    expect(remainingBiologyMethods(rows, 'qwen:4b', 'profile-a')).toEqual(['standard']);
    expect(remainingBiologyMethods(rows, 'qwen:4b', 'other-profile')).toEqual(['contract', 'standard']);
    expect(remainingBiologyMethods([...rows.filter(row => row.caseId !== 'G')], 'qwen:4b', 'profile-a'))
      .toEqual(['contract', 'standard']);
  });
});
