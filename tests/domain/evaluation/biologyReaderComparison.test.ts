import { expect, it } from 'vitest';
import { biologyReadingMetrics, compareBiologyReaders } from '../../../src/evaluation/domain/biologyReaderComparison.ts';
import { buildBiologyRadar, type BiologyRadarObservation } from '../../../src/evaluation/domain/biologyTeacherRadar.ts';

function run(model: string, status = 'success', recordedAt = '2026-11-01'): BiologyRadarObservation {
  return { id:model+recordedAt, model, profileId:model, profile:model, protocol:'contract', provider:'local',
    caseId:'E', recordedAt, method:'generative', status, score:status === 'success' ? 9 : null, referenceScore:10,
    durationMs:2000, decisions:Array.from({length:10},(_,i) => ({id:'p'+i,expected:1,awarded:i === 0 ? null : 1})) };
}
it('conserve un nouvel échec et distingue les durées des notes disponibles', () => {
  const history = [run('a'),run('b'),{...run('a','error','2026-11-02'),decisions:[]}];
  const profiles = buildBiologyRadar(history,'contract','configuration');
  const result = compareBiologyReaders(history,profiles.find(p => p.name === 'a')!,profiles.find(p => p.name === 'b')!);
  expect(biologyReadingMetrics(result,'first')).toMatchObject({ missing:10,correct:0,grades:0,error:null,timed:1,seconds:2 });
  expect(biologyReadingMetrics(result,'second')).toMatchObject({ missing:1,correct:9,grades:1,error:1 });
});
it('écarte les références contradictoires et les répétitions sans correspondant', () => {
  const history = [run('a'),run('b')];
  const [a,b] = buildBiologyRadar(history,'contract','configuration');
  history[0]!.decisions[0]!.expected = 0;
  expect(compareBiologyReaders(history,a!,b!)).toMatchObject({ rows:[],excluded:1 });
  history[0]!.repetition = 2;
  expect(compareBiologyReaders(history,a!,b!)).toMatchObject({ rows:[],excluded:2 });
});
