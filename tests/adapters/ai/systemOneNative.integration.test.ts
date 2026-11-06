import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../../../src/adapters/ai/ollamaProvider.ts';
import { parseGradingProposal } from '../../../src/domain/grading.ts';
import { PILOT_CASES, PILOT_RUBRIC } from '../../../src/domain/pilotEvaluationProtocol.ts';
import type { Rubric } from '../../../src/domain/rubric.ts';

const rubric: Rubric = {
  title: 'Photosynthèse',
  criteria: [{
    id: 'q1-photosynthese', title: 'Q1 – Photosynthèse', maxPoints: 5,
    description: 'Réactifs attendus : CO2 et H2O (1 pt); Source d’énergie attendue : lumière (1 pt); Produit attendu : glucose (1 pt); Produit attendu : O2 (1 pt); Localisation correctement attribuée : chloroplastes (1 pt). Référence : 5/5.',
  }],
};
const answer = (choice: string) => ({ type: 'choice', choice, probabilities: {[choice]:0.99}, confidence:0.93 });
const envelope = (aligned: string) => ({
  model:'d3:4b',
  answers: { alignment: answer(aligned),
    ...Object.fromEntries(Array.from({length:5},(_,i)=>['expected_'+(i+1),answer('present')])),
    ...Object.fromEntries(Array.from({length:5},(_,i)=>['support_'+(i+1),answer('supported')])) },
  usage: { input_tokens: 295, output_tokens: 6 },
});
describe('native Ollama System One routing', () => {
  it('uses Chat only for the photographed copy transcription and System One for kev:latest scoring', async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      seen.push(url);
      if (url.endsWith('/api/chat')) {
        return new Response([
          JSON.stringify({ message: { content: 'CO2 et H2O avec lumière produisent du glucose et de l’oxygène dans les chloroplastes.' }, done: false }),
          JSON.stringify({ message: {}, done: true, eval_count: 40, prompt_eval_count: 80 }),
        ].join('\n') + '\n', { status: 200 });
      }
      if (url.endsWith('/v1/systemone')) {
        return new Response(JSON.stringify({ ...envelope('aligned'), model: 'kev:latest' }), { status: 200 });
      }
      throw new Error('Endpoint inattendu : ' + url);
    });
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'gemma4e:4b', analysisModel: 'kev:latest',
      correctionMethod: 'decision',
    }, fetchMock);
    await provider.generate({
      question: 'Décrire la photosynthèse', rubric: JSON.stringify(rubric),
      images: [{ fileName: 'copie-1.png', mimeType: 'image/png', base64: 'aGVsbG8=' }],
    });
    expect(seen).toEqual([
      'http://localhost:11434/api/chat',
      'http://localhost:11434/v1/systemone',
    ]);
    const chat = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(chat.model).toBe('gemma4e:4b');
    const decision = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(decision.model).toBe('kev:latest');
    expect(decision).not.toHaveProperty('messages');
  });

  it('POSTs actual closed questions to /v1/systemone with no chat payload or fake streaming', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(envelope('aligned')),{status:200}));
    const diagnostic = vi.fn();
    const onUpdate = vi.fn();
    const provider = createOllamaProvider({
      endpoint:'http://localhost:11434',visionModel:'qwen3.5:4b',analysisModel:'d3:4b',
      correctionMethod:'decision',
    },fetchMock);
    const transcription='Réponse de l\'étudiant\nCO2 et H2O grâce à la lumière produisent le glucose et le O2 dans les chloroplastes.';
    const raw = await provider.generate({question:'Décrire la photosynthèse',rubric:JSON.stringify(rubric),transcription},
      undefined,undefined,undefined,diagnostic,onUpdate);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/systemone');
    const payload=JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(Object.keys(payload)).toEqual(['model','state','questions']);
    expect(payload).not.toHaveProperty('messages');
    expect(payload).not.toHaveProperty('stream');
    expect(payload).not.toHaveProperty('format');
    expect(payload).not.toHaveProperty('options');
    expect(Object.keys(payload.questions)).toEqual(['alignment','expected_1','support_1','expected_2','support_2','expected_3','support_3','expected_4','support_4','expected_5','support_5']);
    expect(payload.questions.expected_3).toMatchObject({type:'choice',criteria:{present:expect.any(String),partial:expect.any(String)}});
    expect(parseGradingProposal(raw,rubric).finalScore).toBe(5);
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({model:'d3:4b',promptTokens:295,requestMetadata:expect.objectContaining({stream:false})}));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({status:'completed'}));
  });
  it('sends TEV1 the isolated subcriterion prompts and preserves the pilot partial grade', async () => {
    const testCase = PILOT_CASES[2]!;
    const answers: Record<string, ReturnType<typeof answer>> = { alignment: answer('aligned') };
    PILOT_RUBRIC.criteria.forEach((criterion, i) => criterion.subcriteria?.forEach((item, j) => {
      const prefix = 'criterion_' + (i + 1) + '_';
      const demonstrated = testCase.presentSubcriteria.includes(item.id);
      answers[prefix + 'expected_' + (j + 1)] = answer(demonstrated ? 'present' : 'absent');
      answers[prefix + 'support_' + (j + 1)] = answer(demonstrated ? 'supported' : 'not_demonstrated');
    }));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ model: 'tev1:4b', answers, usage: { input_tokens: 1200, output_tokens: 0 } }),
      { status: 200 },
    ));
    const diagnostic = vi.fn();
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b', analysisModel: 'tev1:4b',
      correctionMethod: 'decision',
    }, fetchMock);
    const raw = await provider.generate({
      question: 'Biologie', rubric: JSON.stringify(PILOT_RUBRIC),
      transcription: testCase.transcription,
    }, undefined, undefined, undefined, diagnostic);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:11434/v1/systemone');
    const payload = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(Object.keys(payload.questions)).toHaveLength(21);
    expect(payload.questions.criterion_2_expected_1.instructions).not.toContain(PILOT_RUBRIC.criteria[1]!.description);
    expect(payload.questions.criterion_4_support_1.instructions).not.toContain(PILOT_RUBRIC.criteria[3]!.description);
    expect(payload.questions.criterion_4_support_1.criteria).toHaveProperty('contradicted');
    expect(payload.state).toContain(PILOT_RUBRIC.criteria[1]!.description);
    const parsed = parseGradingProposal(raw, PILOT_RUBRIC);
    expect(parsed.criteria.map((item) => item.points)).toEqual([2, 1, 1, 1, 0]);
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({
      model: 'tev1:4b', promptId: 'decision.system-one', promptVersion: 6,
      promptTokens: 1200, generatedTokens: 0,
    }));
  });

  it('routes pplx-decider-flash through native System One, not the decision chat fallback', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...envelope('aligned'), model: 'pplx-decider-flash:4b' }), { status: 200 }),
    );
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434',
      visionModel: 'gemma4e:4b',
      analysisModel: 'pplx-decider-flash:4b',
      correctionMethod: 'decision',
    }, fetchMock);
    const raw = await provider.generate({
      question: 'Décrire la photosynthèse',
      rubric: JSON.stringify(rubric),
      transcription: "Réponse de l'étudiant\nCO2 et H2O grâce à la lumière produisent le glucose et le O2 dans les chloroplastes.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/systemone');
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request).toMatchObject({ model: 'pplx-decider-flash:4b', state: expect.any(String), questions: expect.any(Object) });
    expect(request).not.toHaveProperty('messages');
    expect(request).not.toHaveProperty('stream');
    expect(parseGradingProposal(raw, rubric).finalScore).toBe(5);
  });

  it('uses classic Chat routing when classic mode is explicitly selected, regardless of the model name', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('Unsupported API', { status: 400 }));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'gemma4e:4b',
      analysisModel: 'pplx-decider-flash:4b', correctionMethod: 'generative',
    }, fetchMock);
    await expect(provider.generate({
      question: 'Décrire la photosynthèse', rubric: JSON.stringify(rubric), transcription: 'Réponse.',
    })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
  });

  it('flags a mismatched rubric and copy for teacher review rather than granting points', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(envelope('different')),{status:200}));
    const provider = createOllamaProvider({endpoint:'http://localhost:11434',visionModel:'qwen3.5:4b',analysisModel:'d3:4b',correctionMethod:'decision'},fetchMock);
    const raw=await provider.generate({question:'Devoir de biologie',rubric:JSON.stringify(rubric),transcription:'Réponse de l\'étudiant\nLa respiration cellulaire produit de l\'ATP avec la mitochondrie.'});
    const parsed=parseGradingProposal(raw,rubric);
    expect(parsed.scoreIncomplete).toBe(true);
    expect(parsed.criteria[0].assessmentStatus).toBe('not-evaluated');
    expect(parsed.finalScore).toBe(0);
    expect(parsed.criteria[0].questionForTeacher).toMatch(/barème/);
  });
  it('reports native API mismatch directly without sending a second chat request', async () => {
    const fetchMock=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({error:'Unsupported API'}),{status:400}));
    const provider=createOllamaProvider({endpoint:'http://localhost:11434',visionModel:'vision:4b',analysisModel:'d3:4b',correctionMethod:'decision'},fetchMock);
    await expect(provider.generate({question:'Photosynthèse',rubric:JSON.stringify(rubric),transcription:'Réponse.'})).rejects.toThrow(/HTTP 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/v1/systemone');
  });
  it('never auto-overrides a classic-mode user selection based on a known decision model name', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('Unsupported API', { status: 400 }));
    const provider = createOllamaProvider({
      endpoint: 'http://localhost:11434', visionModel: 'vision:4b',
      analysisModel: 'd3:4b', correctionMethod: 'generative',
    }, fetchMock);
    await expect(provider.generate({
      question: 'Photosynthèse', rubric: JSON.stringify(rubric), transcription: 'Réponse.',
    })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
  });
  it('grades a complete four-criterion, twenty-point rubric in ONE native request, without withholding low-probability proposals', async () => {
    const fullRubric: Rubric = {
      title: 'Biologie 20 points',
      criteria: [
        {id:'a',title:'Photosynthèse',description:'Lumière et chloroplastes',maxPoints:5},
        {id:'b',title:'Respiration',description:'Mitochondries et ATP',maxPoints:5},
        {id:'c',title:'Génétique',description:'Chromosomes et ADN',maxPoints:5},
        {id:'d',title:'Écologie',description:'Relations des êtres vivants',maxPoints:5},
      ],
    };
    const native = {
      model:'d3:4b',
      answers: {
        alignment: answer('aligned'),
        ...Object.fromEntries(fullRubric.criteria.map((_,i)=>[
        'criterion_'+(i+1)+'_score',{
          type:'choice',
          choice:'points_5',
          confidence:0.19,
          probabilities:{points_5:i===2?0.53:0.98,points_0:i===2?0.45:0.01,unreadable:i===2?0.02:0.01},
        },
      ])),
      },
      usage:{input_tokens:1200,output_tokens:0},
    };
    const fetchMock=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(native),{status:200}));
    const provider=createOllamaProvider({
      endpoint:'http://localhost:11434',visionModel:'qwen3.5:4b',analysisModel:'d3:4b',correctionMethod:'decision',
    },fetchMock);
    const raw=await provider.generate({
      question:'Quatre questions de biologie',rubric:JSON.stringify(fullRubric),
      transcription:'Réponse de l\'étudiant\nLa photosynthèse se déroule dans les chloroplastes avec la lumière. La respiration produit ATP dans les mitochondries. La génétique repose sur les chromosomes et ADN. En écologie, les êtres vivants interagissent.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent=JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(Object.keys(sent.questions)).toHaveLength(5);
    expect(sent.state.match(/RÉPONSE DE L’ÉTUDIANT/g)).toHaveLength(1);
    expect(sent).not.toHaveProperty('stream');
    const graded=parseGradingProposal(raw,fullRubric);
    expect(graded.criteria).toHaveLength(4);
    expect(graded.criteria.map(item=>item.points)).toEqual([5,5,5,5]);
    expect(graded.scoreIncomplete).not.toBe(true);
    expect(graded.criteria[2].questionForTeacher).toContain('Deux notes restent proches');
  });

});
