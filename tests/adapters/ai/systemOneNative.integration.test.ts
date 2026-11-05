import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from '../../../src/adapters/ai/ollamaProvider.ts';
import { parseGradingProposal } from '../../../src/domain/grading.ts';
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
    ...Object.fromEntries(Array.from({length:5},(_,i)=>['expected_'+(i+1),answer('present')])) },
  usage: { input_tokens: 295, output_tokens: 6 },
});
describe('native Ollama System One routing', () => {
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
    expect(Object.keys(payload.questions)).toEqual(['alignment','expected_1','expected_2','expected_3','expected_4','expected_5']);
    expect(payload.questions.expected_3).toMatchObject({type:'choice',criteria:{present:expect.any(String),partial:expect.any(String)}});
    expect(parseGradingProposal(raw,rubric).finalScore).toBe(5);
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({model:'d3:4b',promptTokens:295,requestMetadata:expect.objectContaining({stream:false})}));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({status:'completed'}));
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
  it('rejects a decision-only model mistakenly configured in classic mode before any call', async () => {
    const fetchMock=vi.fn<typeof fetch>();
    const provider=createOllamaProvider({endpoint:'http://localhost:11434',visionModel:'vision:4b',analysisModel:'d3:4b',correctionMethod:'generative'},fetchMock);
    await expect(provider.generate({question:'Photosynthèse',rubric:JSON.stringify(rubric),transcription:'Réponse.'})).rejects.toThrow(/décisionnel/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
