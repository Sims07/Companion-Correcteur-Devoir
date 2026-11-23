import { expect, it } from 'vitest';
import { availableReaders, pairedDecisions, summarizeReader, type FixtureReport } from '../../../src/evaluation/domain/pairedReaders.ts';

function report(choices: (string | null)[], version = 9) {
  const gold = { title: 'present', label: 'absent', scale: 'present' };
  return { protocolId: 'fixtures', version, cases: [{ caseId: 'A', gold, experiments: [{
    profileId: 'profile', profileName: 'Lecteur', model: 'local', repetition: 1, method: 'direct',
    status: 'success', observations: Object.keys(gold).flatMap((key,i) => choices[i] ? [{
      key, choice: choices[i], teacherReviewRequested: i === 2,
    }] : []),
  }] }] } as unknown as FixtureReport;
}

it('rejoue le recours sans consulter la référence et conserve les erreurs silencieuses dans le dénominateur', () => {
  const a = report(['absent',null,'absent']), b = report(['present','absent','present']);
  const key = availableReaders(a)[0]!.id;
  const { rows } = pairedDecisions(a,key,b,key);
  expect(summarizeReader(rows,'first')).toEqual({ correct:0,wrong:2,missing:1,reviews:2,silentErrors:1,calls:0 });
  expect(summarizeReader(rows,'targeted')).toEqual({ correct:2,wrong:1,missing:0,reviews:1,silentErrors:1,calls:2 });
  expect(summarizeReader(rows,'second').correct).toBe(3);
});

it('écarte les versions, références et répétitions incompatibles', () => {
  const a = report([]), b = report([],8), key = availableReaders(a)[0]!.id;
  expect(pairedDecisions(a,key,b,key).incompatible).toBe(true);
  b.version = a.version;
  b.cases[0]!.gold.title = 'absent';
  expect(pairedDecisions(a,key,b,key)).toMatchObject({ rows:[],excluded:1 });
  b.cases[0]!.experiments[0]!.repetition = 2;
  expect(pairedDecisions(a,key,b,key)).toMatchObject({ rows:[],excluded:2 });
});
