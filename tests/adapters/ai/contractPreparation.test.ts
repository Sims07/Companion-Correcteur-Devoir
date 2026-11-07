import { describe, expect, it, vi } from 'vitest';
import { prepareQuestionContracts } from '../../../src/adapters/ai/contractPreparation.ts';
import { buildSubjectReferencePrompt } from '../../../src/adapters/ai/prompts/visionPrompts.ts';
const rubric = { title: 'Test', criteria: ['c1', 'c2'].map(id => ({ id, title: id, description: 'Relation attendue', maxPoints: 1 })) };
const settings = { endpoint: 'http://localhost:11434', analysisModel: 'generative-model' };
const sources = { subject: 'Question 1\nConsigne exacte', correction: '' };
function proposal(id: string) {
  const missing = { value: '', source: 'missing', quote: '' };
  return { criterionId: id, scope: 'question', fields: { questionId: { value: '1', source: 'subject', quote: 'Question 1' }, instruction: { value: 'Consigne exacte', source: 'subject', quote: 'Consigne exacte' }, expectedRelation: missing, acceptedAlternatives: missing, contradictions: missing }, warning: 'Sans corrigé' };
}
describe('automatic contract preparation', () => {
  it.each([false, true])('uses sequential generative requests with optional correction (OpenAI=%s)', async apiCompatible => {
    let active = 0, calls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      expect(++active).toBe(1);
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('generative-model');
      expect(body.messages[0].content).toContain('Sans corrigé');
      expect(body.messages[0].content).not.toContain('/v1/systemone');
      const content = JSON.stringify(proposal('c' + (++calls)));
      await Promise.resolve(); active--;
      return new Response(JSON.stringify(apiCompatible ? { choices: [{ message: { content }, finish_reason: 'stop' }] } : { message: { content } }));
    });
    const result = await prepareQuestionContracts(rubric, sources, { ...settings, apiCompatible }, undefined, undefined, fetchMock);
    expect(result.suggestions).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain(apiCompatible ? 'chat/completions' : '/api/chat');
  });
  it('aborts before any request and refuses oversized input without truncating it', async () => {
    const mock = vi.fn<typeof fetch>(); const controller = new AbortController(); controller.abort();
    await expect(prepareQuestionContracts(rubric, sources, settings, undefined, controller.signal, mock)).rejects.toThrow();
    await expect(prepareQuestionContracts(rubric, { ...sources, subject: 'a'.repeat(25000) }, settings, undefined, undefined, mock)).rejects.toThrow('trop long');
    expect(mock).not.toHaveBeenCalled();
  });
  it('does not return partial or truncated drafts as successful preparation', async () => {
    const mock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: { content: JSON.stringify(proposal('c1')) }, done_reason: 'length' })));
    await expect(prepareQuestionContracts(rubric, sources, settings, undefined, undefined, mock)).rejects.toThrow('tronquée');
  });
  it('preserves an existing answer key only in the explicit reference preparation mode', () => {
    expect(buildSubjectReferencePrompt('page', true)).toContain('Ne retire pas le corrigé existant');
    expect(buildSubjectReferencePrompt('page')).not.toContain('Ne retire pas le corrigé existant');
  });
});
