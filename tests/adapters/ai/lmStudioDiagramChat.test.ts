import { describe, expect, it, vi } from 'vitest';
import { sendLmStudioDiagramTurn } from '../../../src/shared/adapters/ai/lmStudioDiagramChat.ts';

describe('LM Studio native conversation reasoning configuration', () => {
  it('omits reasoning for Instruct while keeping images and the conversation format', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('simulated server response', { status: 400 }));
    const preview = vi.fn();
    const turn = {
      model: 'qwen3-vl-32b-instruct-mlx', think: false, omitReasoningParameter: true,
      options: { num_predict: 250 }, messages: [{ content: 'Premier critère', images: ['data:image/png;base64,aW1hZ2U='] }],
    };
    await sendLmStudioDiagramTurn('https://local.example/api/v1/chat', '', {}, turn,
      { method: 'POST' }, fetchMock, preview);
    const first = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(first).not.toHaveProperty('reasoning');
    expect(first.model).toBe(turn.model);
    expect(first.input[0].type).toBe('image');
    expect(JSON.stringify(preview.mock.calls)).not.toContain('aW1hZ2U=');

    await sendLmStudioDiagramTurn('https://local.example/api/v1/chat', '', {}, {
      ...turn, omitReasoningParameter: false, think: false,
    }, { method: 'POST' }, fetchMock, preview);
    const second = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(second.reasoning).toBe('off');
  });
});
