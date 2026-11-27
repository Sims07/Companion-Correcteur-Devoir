import { expect, it } from 'vitest';
import { chooseCriterionLevel, concurrencyProfileKey, resolveCriterionLevel, type CalibrationSample } from '../src/shared/domain/concurrencyCalibration.ts';
import { defaultAiModelConfiguration as config } from '../src/shared/domain/aiModelProfiles.ts';
const series = (level: 1 | 2 | 4 | 8, durationMs: number): CalibrationSample[] => ['A','B','C'].map(caseId =>
  ({ caseId, level, durationMs, peak: Math.min(4,level), errors: [], deviations: Object.fromEntries(Array.from({length:19}, (_,i) => [i,0])) }));

it('chooses the fastest achieved level with complete quality comparisons', () => {
  const rows = [...series(1, 100), ...series(2, 70), ...series(4, 80), ...series(8, 20)];
  expect(chooseCriterionLevel(rows)).toBe(2);
  rows[3].deviations[2] = 0.1;
  expect(chooseCriterionLevel(rows)).toBe(4);
  rows[6].errors = ['timeout'];
  expect(chooseCriterionLevel(rows)).toBe(1);
  expect(chooseCriterionLevel(rows.slice(1))).toBe(1);
});

it('isolates model, zoom and thinking settings and excludes credentials', () => {
  const key = concurrencyProfileKey({ ...config, endpoint: 'https://user:password@localhost:1234/v1/responses?token=secret', apiKey: 'private' });
  expect(key).not.toMatch(/password|secret|private/);
  expect(concurrencyProfileKey(config)).not.toBe(concurrencyProfileKey({...config, smartZoom:true}));
  expect(resolveCriterionLevel({...config, criterionConcurrency:'auto'})).toBe(1);
});
