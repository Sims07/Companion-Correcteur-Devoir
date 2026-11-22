import { expect, it, vi } from 'vitest';
import { extractVisualRelationGraphV2 } from '../../../src/evaluation/adapters/ai/relationGraphV2Client.ts';
import { DIAGRAM_RELATIONS_V2_SCHEMA } from '../../../src/evaluation/domain/scientificDiagramRelationGraphV2.ts';

const valid = {
  labels:[{id:'l1',text:'Chromosomes',phase:'metaphase'}],
  structures:[{id:'s1',kind:'spindle',phase:'metaphase',visualCue:'Faisceau de traits convergents'}],
  leaders:[{labelId:'l1',targetId:'s1',status:'connected',tipX:440,tipY:530}],
  layout:'rows',complete:true,
};
const image = {mimeType:'image/png',base64:'SYNTHETIC_IMAGE_BASE64'};
const ok = (content: string) => new Response(JSON.stringify({message:{content},done_reason:'stop'}), {
  status:200,headers:{'content-type':'application/json'},
});

it('envoie uniquement l’image originale à Ollama et extrait le point d’arrivée sans barème',async () => {
  const mock = vi.fn(async () => ok(JSON.stringify(valid)));
  const result = await extractVisualRelationGraphV2({
    endpoint:'http://localhost:11434',model:'gemma4:12b',image,
  },mock as unknown as typeof fetch);
  expect(result.leaders[0]).toMatchObject({targetId:'s1',tipX:440,tipY:530});
  expect(mock).toHaveBeenCalledTimes(1);
  const [url,init] = mock.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('http://localhost:11434/api/chat');
  const payload = JSON.parse(init.body as string);
  expect(payload.format).toEqual(DIAGRAM_RELATIONS_V2_SCHEMA);
  expect(payload.messages[1].images).toEqual([image.base64]);
  expect(payload.think).toBe(false);
  expect(payload.options).toEqual({num_predict:2400,num_ctx:4096});
  expect(JSON.stringify(payload)).not.toMatch(/0,68|9,34|8,66|flèches inversées|score de référence/);
});

it('honors saved Off/Low/High reasoning during graph-first V2 on LM Studio', async () => {
  const efforts: string[] = [];
  const network = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { reasoning_effort?: string };
    efforts.push(body.reasoning_effort ?? 'missing');
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(valid) }, finish_reason: 'stop' }],
    }), { status: 200 });
  });
  for (const think of [false, 'low', 'high'] as const) {
    await expect(extractVisualRelationGraphV2({
      endpoint: 'http://localhost:1234', apiCompatible: true, model: 'gemma-26b',
      image, think,
    }, network)).resolves.toMatchObject({ complete: true });
  }
  expect(efforts).toEqual(['none', 'low', 'high']);
});

it('retente une réponse JSON invalide une seule fois, sans modifier le dessin source',async () => {
  let i=0;
  const mock = vi.fn(async () => ok(++i===1 ? '{oops' : JSON.stringify(valid)));
  const result=await extractVisualRelationGraphV2({
    endpoint:'http://127.0.0.1:11434',model:'qwen3.5:4b',image,
  },mock as unknown as typeof fetch);
  expect(mock).toHaveBeenCalledTimes(2);
  expect(result.structures[0]?.kind).toBe('spindle');
  for (const [,init] of mock.mock.calls as unknown as Array<[string,RequestInit]>) {
    const data=JSON.parse(init.body as string);
    expect(data.messages[1].images).toEqual([image.base64]);
  }
});

it('n’envoie pas de photo si le modèle, l’URL ou l’image sont invalides',async () => {
  const mock=vi.fn(async () => ok(JSON.stringify(valid))) as unknown as typeof fetch;
  await expect(extractVisualRelationGraphV2({endpoint:'https://example.test/invalid-path',
    model:'gemma',image},mock)).rejects.toThrow(/racine|Adresse/);
  await expect(extractVisualRelationGraphV2({endpoint:'http://localhost:11434',
    model:'',image},mock)).rejects.toThrow(/manquant/);
  await expect(extractVisualRelationGraphV2({endpoint:'http://localhost:11434',
    model:'gemma',image:{...image,base64:''}},mock)).rejects.toThrow(/non valide/);
  expect(mock).not.toHaveBeenCalled();
});

it('interrompt immédiatement sans appel si signal déjà annulé',async () => {
  const controller=new AbortController();controller.abort();
  const mock=vi.fn(async () => ok(JSON.stringify(valid))) as unknown as typeof fetch;
  await expect(extractVisualRelationGraphV2({
    endpoint:'http://localhost:11434',model:'gemma',image,signal:controller.signal,
  },mock)).rejects.toMatchObject({name:'AbortError'});
  expect(mock).not.toHaveBeenCalled();
});

it('poursuit après deux validations invalides avec une preuve V2 explicitement non concluante',async () => {
  const invalid = {...valid, labels:[{...valid.labels[0]!,id:'!!!'}]};
  const mock = vi.fn(async () => ok(JSON.stringify(invalid)));
  const result = await extractVisualRelationGraphV2({
    endpoint:'http://localhost:11434',model:'qwen3.5:4b',image,
  },mock as unknown as typeof fetch);
  expect(mock).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({labels:[],structures:[],leaders:[],layout:'unclear',complete:false});
  expect(result.validationIssue).toMatch(/Identifiant V2 invalide : labels.id/);
  expect(JSON.stringify(result)).not.toContain(image.base64);
});

it('garde les vrais échecs réseau et les annulations comme erreurs, sans repli silencieux',async () => {
  const unavailable = vi.fn(async () => new Response('unavailable',{status:503}));
  await expect(extractVisualRelationGraphV2({
    endpoint:'http://localhost:11434',model:'qwen3.5:4b',image,
  },unavailable as unknown as typeof fetch)).rejects.toThrow(/indisponible/);
  expect(unavailable).toHaveBeenCalledTimes(1);
  const controller = new AbortController();
  const abortAfterFirst = vi.fn(async () => {
    controller.abort();
    return ok('{bad json');
  });
  await expect(extractVisualRelationGraphV2({
    endpoint:'http://localhost:11434',model:'qwen3.5:4b',image,signal:controller.signal,
  },abortAfterFirst as unknown as typeof fetch)).rejects.toMatchObject({name:'AbortError'});
  expect(abortAfterFirst).toHaveBeenCalledTimes(1);
});

it('conserve le dessin original et dégrade une destination douteuse au lieu de la considérer correcte',async () => {
  const speculative = {...valid, leaders:[{...valid.leaders[0]!,status:'uncertain',targetId:'s1'}]};
  const mock = vi.fn(async () => ok(JSON.stringify(speculative)));
  const result = await extractVisualRelationGraphV2({
    endpoint:'http://localhost:11434',model:'qwen3.5:4b',image,
  },mock as unknown as typeof fetch);
  expect(mock).toHaveBeenCalledTimes(1);
  expect(result.validationIssue).toBeUndefined();
  expect(result.leaders[0]).toMatchObject({status:'uncertain',targetId:'unknown',tipX:-1,tipY:-1});
});
