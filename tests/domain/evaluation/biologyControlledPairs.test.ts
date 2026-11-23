import { expect,it } from 'vitest';
import { QUESTION_CONTRACT_PAIRED_CASES } from '../../../src/evaluation/domain/questionContractPilot.ts';
import { questionContractRepeatabilitySteps } from '../../../src/evaluation/domain/questionContractRepeatability.ts';

it('isole la respiration nocturne sur trois copies et conserve le barème initial',() => {
  const [a,h,i] = QUESTION_CONTRACT_PAIRED_CASES;
  expect(h!.transcription).toBe(a!.transcription.replace('respirent aussi','cessent de respirer'));
  expect(i!.transcription.slice(0,i!.transcription.indexOf('Même dans'))).toBe(a!.transcription.slice(0,a!.transcription.indexOf('Les cellules végétales')));
  expect(h!.presentSubcriteria).toEqual(a!.presentSubcriteria.filter(id => id !== 'p10'));
  expect(i!.presentSubcriteria).toEqual(a!.presentSubcriteria);
  expect([a,h,i].map(c => c!.referenceScore)).toEqual([10,9,10]);
  expect(questionContractRepeatabilitySteps(3,'paired').map(s => s.caseId)).toEqual(['A','H','I','A','H','I','A','H','I']);
  expect(questionContractRepeatabilitySteps(3,'stress')).toHaveLength(12);
});