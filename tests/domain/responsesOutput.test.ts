import { describe, expect, it } from 'vitest';
import { ResponsesOutput } from '../../src/shared/domain/responsesOutput.ts';

const message = (...texts: string[]) => ({
  type: 'message' as const, content: texts.map(text => ({ type: 'output_text', text })),
});

describe('Responses output reconciliation', () => {
  it('orders indexed parts and fills omitted terminal content without duplicating snapshots', () => {
    const output = new ResponsesOutput();
    output.consume({ type: 'response.output_text.delta', output_index: 0, content_index: 1, delta: 'conclusion' });
    output.consume({ type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'pré' });
    output.consume({ type: 'response.output_text.done', output_index: 0, content_index: 0, text: 'préface ' });
    output.consume({ type: 'response.output_item.done', output_index: 0, item: message('préface ', 'conclusion') });
    expect(output.reconcile({ status: 'completed', output: [message('préface ', '')] }).output_text)
      .toBe('préface conclusion');
  });

  it('rejects incompatible confirmed texts instead of choosing a grade', () => {
    const output = new ResponsesOutput();
    output.consume({ type: 'response.output_text.delta', delta: '{"points":1}' });
    expect(() => output.reconcile({ status: 'completed', output_text: '{"points":0}' })).toThrow('incohérent');
  });

  it('keeps reasoning separate and never promotes fragments on an incomplete response', () => {
    const output = new ResponsesOutput();
    output.consume({ type: 'response.reasoning_text.delta', delta: '{"points":0}' });
    output.consume({ type: 'response.output_text.delta', delta: '{"points":1}' });
    expect(output.streamedReasoning).toBe('{"points":0}');
    expect(output.reconcile({ status: 'incomplete', output: [] }).output_text).toBeUndefined();
  });
});
