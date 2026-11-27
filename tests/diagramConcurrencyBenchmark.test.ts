import { expect, it } from 'vitest';
import { measureDiagramConcurrency } from '../src/evaluation/application/diagramConcurrencyBenchmark.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURES } from '../src/evaluation/domain/scientificDiagramFixtures.ts';
import { diagramTargetKey } from '../src/evaluation/domain/scientificDiagramProtocol.ts';
import type { GradingProvider, Rubric } from '../src/correction/api/index.ts';

it.each([4,8] as const)('mesure les 19 décisions de référence avec %i groupes indépendants', async groups => {
  const fixture = SCIENTIFIC_DIAGRAM_FIXTURES[0];
  const generate: GradingProvider['generate'] = async (request, _chunk, _stage, _transcription, diagnostic) => {
    const criterion = (JSON.parse(request.rubric) as Rubric).criteria[0];
    const parent = criterion.id.split('/group-')[0];
    const subcriteria = criterion.subcriteria!.map(sub => ({ subcriterionId:sub.id,
      points:fixture.referencePoints[diagramTargetKey(parent,sub.id)], evidence:'Observé' }));
    diagnostic?.({ stage:'analysis', kind:'model', model:'vision', raw:'', generatedTokens:10, elapsedMs:1 });
    return JSON.stringify({criteria:[{ criterionId:criterion.id, points:Math.round(subcriteria.reduce((a,s) => a+s.points,0)*100)/100,
      evidence:'Observé', confidence:'high', subcriteria }]});
  };
  const result = await measureDiagramConcurrency(fixture, [], groups, () => ({id:'test', generate}),
    new AbortController().signal, () => {}, groups);
  expect(result.errors).toEqual([]);
  expect(result.peak).toBe(groups);
  expect(result.exact).toBe(19);
  expect(result.measured).toBe(19);
  expect(result.tokensPerSecond).toBeGreaterThan(0);
});
