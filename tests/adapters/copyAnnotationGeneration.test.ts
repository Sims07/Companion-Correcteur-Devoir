import { expect, it, vi } from 'vitest';
import { requiredCopyAnnotationDeductions } from '../../src/correction/domain/copyAnnotationSuggestions.ts';
import { generateCopyAnnotations } from '../../src/correction/adapters/ai/generateCopyAnnotations.ts';

const image = { mimeType: 'image/png', base64: 'synthetic' };
const criteria = [{ criterionId: 'titre', title: 'Titre', points: 1, maxPoints: 2, evidence: 'Titre visible', rationale: 'À souligner' }];
const base = { endpoint: 'http://127.0.0.1:11434', apiCompatible: false, apiKey: '', model: 'vision' };
const content = JSON.stringify({ annotations: [{ message: 'Souligne le titre.', criterionId: 'titre', tone: 'improvement', deductionId: requiredCopyAnnotationDeductions(criteria)[0].deductionId }] });
const phase = vi.fn();

it('sends every page in a single request to Ollama and returns reviewable suggestions', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ message: { content }, done_reason: 'stop' }));
  const signal = new AbortController().signal;
  const result = await generateCopyAnnotations([image, image], criteria, base, signal, phase, fetcher);
  expect(fetcher).toHaveBeenCalledOnce();
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe(base.endpoint + '/api/chat');
  expect(init).toMatchObject({ redirect: 'error', signal });
  const payload = JSON.parse(String(init?.body));
  expect(payload.messages[0].images).toEqual([image.base64, image.base64]);
  expect(payload.messages[0].content).toContain('"points":1');
  expect(payload.messages[0].content).toContain('Déductions obligatoires');
  expect(payload.messages[0].content).toContain(requiredCopyAnnotationDeductions(criteria)[0].deductionId);
  expect(payload.messages[0].content).toContain('"tone":"improvement","deductionId":');
  expect(payload.messages[0].content).toContain('tone:"positive"');
  expect(payload.messages[0].content).toContain('tone:"improvement"');
  expect(payload.messages[0].content).toContain('Pour chaque page, planifie ensemble les positions');
  expect(payload.messages[0].content).toContain('Évite tout chevauchement entre les textes et les repères');
  expect(payload.messages[0].content).toContain('à droite si x ≤ 500, à gauche sinon');
  expect(payload.messages[0].content).toContain('vers le bas si y ≤ 500, vers le haut sinon');
  expect(payload.messages[0].content).toContain('sans masquer les réponses, dessins ou légendes');
  expect(payload.messages[0].content).toContain('si aucun emplacement sans chevauchement n’est disponible, conserve la remarque et renvoie placement:null');
  expect(phase).toHaveBeenLastCalledWith('validating');
  expect(result[0]).toMatchObject({ criterionId: 'titre', status: 'suggested' });
});

it('uses the local LM Studio Responses transport without storing a conversation', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: 'completed', output: [
    { type: 'reasoning', summary: [{ type: 'summary_text', text: 'ignored' }] },
    { type: 'message', content: [{ type: 'output_text', text: content }] },
  ] }));
  const endpoint = 'https://mac-mini.local:1234/v1/responses';
  const result = await generateCopyAnnotations([image], criteria, { ...base, endpoint, apiCompatible: true }, new AbortController().signal, phase, fetcher);
  expect(result[0].message).toBe('Souligne le titre.');
  expect(fetcher).toHaveBeenCalledOnce();
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe(endpoint);
  expect(JSON.parse(String(init?.body))).toMatchObject({ store: false, input: [{ role: 'user', content: [{ type: 'input_image' }, { type: 'input_text' }] }] });
  expect(init?.redirect).toBe('error');
});

it('blocks public endpoints before uploading and rejects a truncated generation', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ message: { content }, done_reason: 'length' }));
  const controller = new AbortController();
  await expect(generateCopyAnnotations([image], criteria, { ...base, endpoint: 'https://cloud.example.com' }, controller.signal, phase, fetcher)).rejects.toThrow(/adresse IA locale/);
  expect(fetcher).not.toHaveBeenCalled();
  await expect(generateCopyAnnotations([image], criteria, base, controller.signal, phase, fetcher)).rejects.toThrow(/limite de génération/);
  controller.abort();
  await expect(generateCopyAnnotations([image], criteria, base, controller.signal, phase, fetcher)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).toHaveBeenCalledOnce();
});

it('keeps each missed subcriterion as an unplaced improvement when the model returns only praise', async () => {
  const detailed = [{ ...criteria[0], subcriteria: [
    { subcriterionId: 'present', title: 'Présent', points: 1, maxPoints: 1, evidence: 'Titre présent' },
    { subcriterionId: 'underlined', title: 'Souligné ou encadré', points: 0, maxPoints: 1, evidence: 'Titre non souligné' },
  ] }];
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ message: { content: '{"annotations":[{"message":"Beau dessin","tone":"positive"}]}' } }));
  const notes = await generateCopyAnnotations([image], detailed, base, new AbortController().signal, phase, fetcher);
  expect(notes[0]).toMatchObject({ criterionId: 'titre', tone: 'improvement', message: 'Titre — Souligné ou encadré : Titre non souligné', status: 'suggested' });
  expect(notes[0].placement).toBeUndefined();
  expect(notes[1].tone).toBe('positive');
  const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(payload.messages[0].content).toContain('Souligné ou encadré');
});
