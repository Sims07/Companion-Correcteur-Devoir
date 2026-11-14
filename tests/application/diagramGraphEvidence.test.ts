import { expect, it, vi } from 'vitest';
import { extractDiagramGraphEvidence, graphGradingContext } from '../../src/application/diagramGraphEvidence.ts';
import { trialSteps } from '../../src/domain/radarTimeline.ts';
import { resolveModelProfile } from '../../src/domain/diagramLabRadarLaunch.ts';
import { buildDiagramLabRadar, rankDiagramLabRadar, RADAR_PRESETS } from '../../src/domain/diagramLabRadar.ts';

const pages = ['a', 'b'].map(base64 => ({base64, mimeType:'image/png'}));
const graph = {labels:['A', 'B'], arrows:[{first:'A', second:'B', tip:'unclear' as const}], containment:[], arrowsComplete:false};

it('observes each image independently, preserving page order and uncertainty for grading', async () => {
  const observe = vi.fn(async () => graph);
  const evidence = await extractDiagramGraphEvidence(pages, 'vision', new AbortController().signal, observe);
  expect(observe.mock.calls).toEqual(pages.map(image => [image]));
  expect(evidence.pages).toEqual([{page:1,graph}, {page:2,graph}]);
  expect(graphGradingContext(evidence)).toContain(JSON.stringify(evidence.pages));
});

it('stops before the next image when cancelled during observation', async () => {
  const controller = new AbortController();
  const observe = vi.fn(async () => { controller.abort(); return graph; });
  await expect(extractDiagramGraphEvidence(pages, 'vision', controller.signal, observe)).rejects.toThrow();
  expect(observe).toHaveBeenCalledTimes(1);
});

it('keeps the graph-first grading route after radar profile resolution', () => {
  const profiles = [{id:'q',name:'Qwen',configuration:{analysisModel:'qwen',visionModel:'qwen',correctionMethod:'generative'}}];
  const [candidate] = rankDiagramLabRadar(buildDiagramLabRadar([], 'model', profiles), RADAR_PRESETS.balanced);
  const plan = resolveModelProfile(profiles,'model',candidate!,{profileId:'q',profileName:'Qwen',axis:'arrows',steps:trialSteps('graph-first-v1')});
  expect(plan?.steps.filter(s => s.protocol !== 'graph').map(s => s.method)).toEqual(Array(3).fill('graph-first-v1'));
});
