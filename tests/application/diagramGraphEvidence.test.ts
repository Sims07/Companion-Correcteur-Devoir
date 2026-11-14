import { expect, it, vi } from 'vitest';
import { extractDiagramGraphEvidence, extractDiagramGraphEvidenceV2, graphGradingContext } from '../../src/application/diagramGraphEvidence.ts';
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

it('passes graph V2 physical endpoint observations into the grader without inferred points', async () => {
  const source = {
    labels:[{id:'l1',text:'Chromosomes',phase:'metaphase' as const}],
    structures:[{id:'s1',kind:'spindle' as const,phase:'metaphase' as const,
      visualCue:'Faisceau observé au centre'}],
    leaders:[{labelId:'l1',targetId:'s1',status:'connected' as const,tipX:390,tipY:480}],
    layout:'rows' as const,complete:true,
  };
  const observe=vi.fn(async () => source);
  const evidence=await extractDiagramGraphEvidenceV2(pages,'gemma',new AbortController().signal,observe);
  expect(evidence.version).toBe('graph-first-v2');
  expect(observe).toHaveBeenCalledTimes(2);
  expect(evidence.pages.map(item=>item.graph.leaders[0]?.targetId)).toEqual(['s1','s1']);
  const context=graphGradingContext(evidence);
  expect(context).toContain('une autre structure');
  expect(context).toContain('V2');
  expect(context).toContain('spindle');
  expect(context).not.toContain('0.68');
});


it('annonce une V2 invalide au correcteur sans promouvoir des cibles imaginaires', async () => {
  const source = { labels:[],structures:[],leaders:[],layout:'unclear' as const,
    complete:false,validationIssue:'Identifiant V2 invalide : labels.id' };
  const evidence = await extractDiagramGraphEvidenceV2(
    pages,'qwen3.5:4b',new AbortController().signal,async () => source,
  );
  const context = graphGradingContext(evidence);
  expect(context).toContain('extraction V2 non concluante');
  expect(context).toContain('revue enseignante');
  expect(context).toContain('"complete":false');
  expect(context).not.toContain('"targetId":"s1"');
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
