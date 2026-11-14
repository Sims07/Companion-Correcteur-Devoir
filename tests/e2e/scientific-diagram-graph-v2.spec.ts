import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defaultAiModelConfiguration } from '../../src/domain/aiModelProfiles.ts';
import { chooseEvaluationModel } from './helpers/evaluation-models.ts';

function fixtureV2(swapped: boolean) {
  const labels = [
    ['l1','Noyau','interphase'], ['l2','Chromosomes','prophase'],
    ['l3','Chromosomes','metaphase'], ['l4','Fuseau mitotique','metaphase'],
    ['l5','Noyau fils','telophase'], ['l6','Plaque cellulaire','telophase'],
  ] as const;
  const kinds = ['nucleus','chromosomes','chromosomes','spindle','nucleus','cell-plate'];
  const targets = swapped ? [0,1,3,2,5,4] : [0,1,2,3,4,5];
  return {
    labels:labels.map(([id,text,phase])=>({id,text,phase})),
    structures:labels.map(([id,,phase],i)=>({id:'s'+id.slice(1),phase,
      kind:kinds[i],visualCue:'Structure dessinee distincte du texte'})),
    leaders:labels.map(([id],i)=>({labelId:id,targetId:'s'+String(targets[i]!+1),
      status:'connected',tipX:130+i*90,tipY:250+i*90})),
    layout:'rows',complete:true,
  };
}

test('one-click D/E V2 traces four swapped targets without giving the grader the reference answers', async ({page}) => {
  await page.addInitScript(cfg => localStorage.setItem(
    'companion-correcteur:ollama-profiles:v1',
    JSON.stringify([{id:'graph-v2',name:'Modèle relationnel V2',mode:'single',
      updatedAt:'2026-11-14T10:00:00Z',
      configuration:{...cfg,analysisModel:'qwen:4b',visionModel:'qwen:4b',correctionMethod:'generative'}}]),
  ),defaultAiModelConfiguration);
  const calls: Array<{extraction:boolean;text:string;image:string}> = [];
  let extractionCount=0;
  await page.route('http://localhost:11434/**',async route => {
    const req=route.request();const path=new URL(req.url()).pathname;
    const headers={'access-control-allow-origin':'*',
      'access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS',
      'content-type':'application/json'};
    if(req.method()==='OPTIONS') return route.fulfill({status:204,headers});
    if(path==='/api/chat') {
      const body=req.postDataJSON() as {format?:{properties?:Record<string,unknown>};
        messages:Array<{content:string;images?:string[]}>};
      const extraction=Boolean(body.format?.properties?.leaders);
      calls.push({extraction,text:JSON.stringify(body.messages.map(m=>m.content)),
        image:body.messages.find(m=>m.images?.length)?.images?.[0]??''});
      if(extraction) {
        const graph=fixtureV2(extractionCount++===1);
        return route.fulfill({status:200,headers,
          body:JSON.stringify({message:{content:JSON.stringify(graph)},done:true})});
      }
      // Keep the grading step separate: the graph audit must not fabricate a grade.
      return route.fulfill({status:503,headers,body:'Grading unavailable for this test'});
    }
    return route.fulfill({status:200,headers,
      body:JSON.stringify(path==='/api/tags'
        ? {models:[{name:'qwen:4b',model:'qwen:4b'}]}
        : path==='/api/ps' ? {models:[]} : {model_info:{},capabilities:['vision','completion']})});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Évaluer les modèles'}).click();
  await page.getByRole('navigation',{name:'Espaces de l’évaluation'})
    .getByRole('button',{name:'Tests',exact:true}).click();
  await page.getByRole('group',{name:'Parcours de test'})
    .getByRole('button',{name:/Schémas scientifiques/}).click();
  const panel=page.getByRole('region',{name:'Protocole schémas scientifiques'});
  await chooseEvaluationModel(page);
  await panel.getByRole('tab',{name:/Sens des flèches/}).click();
  await panel.getByRole('button',{name:'Tester D/E avec graphe V2'}).click();
  await expect.poll(()=>calls.filter(c=>c.extraction).length,{timeout:30000}).toBe(2);
  expect(calls[0]?.extraction).toBe(true);
  expect(calls[0]?.text).not.toMatch(/flèches inversées|référence 8[.,]66|0[.,]68/);
  expect(calls.filter(c=>!c.extraction).length).toBe(2);
  for(const c of calls.filter(c=>!c.extraction)) {
    expect(c.text).toContain('visualCue');
    expect(c.image).toBeTruthy();
  }
  const results=panel.getByRole('region',{name:'Résultats des schémas scientifiques'});
  await expect(results).toBeVisible();
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    results.getByRole('button',{name:'Exporter le rapport JSON'}).click(),
  ]);
  const report=JSON.parse(await readFile(await download.path(),'utf8')) as {
    pairedDiagnostics:Array<{graphV2?:{status:string;observedChangedTargets:string[]};status:string}>;
    cases:Array<{caseId:string;diagnostic:Array<{graphV2?:{correct:number}}>;
      experiments:Array<{method:string;score:number|null;graphEvidence?:{version:string}}>}> ;
  };
  expect(report.pairedDiagnostics[0]?.graphV2?.status).toBe('detected');
  expect(report.pairedDiagnostics[0]?.graphV2?.observedChangedTargets).toHaveLength(4);
  expect(report.cases.find(c=>c.caseId==='D')?.diagnostic[0]?.graphV2?.correct).toBe(6);
  expect(report.cases.find(c=>c.caseId==='E')?.diagnostic[0]?.graphV2?.correct).toBe(6);
  expect(report.cases.find(c=>c.caseId==='E')?.experiments[0]?.method).toBe('graph-first-v2');
  expect(report.cases.find(c=>c.caseId==='E')?.experiments[0]?.score).toBeNull();
  expect(JSON.stringify(report)).not.toContain('iVBORw0KGgo');
});
