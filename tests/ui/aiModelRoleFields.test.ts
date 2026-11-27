// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiModelRoleFields } from '../../src/shared/ui/components/AiModelRoleFields.tsx';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const containers: Array<{ root: ReturnType<typeof createRoot>; node: HTMLDivElement }> = [];
afterEach(() => { for (const { root, node } of containers.splice(0)) { act(() => root.unmount()); node.remove(); } });
function render(overrides = {}) {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); containers.push({ root, node });
  const props = { prefix: 'evaluation' as const, models: [], generativeModel: 'qwen', decisionModel: 'tev1:4b', visionModel: 'ocr', method: 'generative' as const, apiCompatible: false, analysisThinking: false, analysisReasoningEffort: 'medium' as const, onReasoning: vi.fn(), onGenerativeModel: vi.fn(), onDecisionModel: vi.fn(), onMethod: vi.fn(), ...overrides };
  act(() => root.render(createElement(AiModelRoleFields, props)));
  return { node, props };
}

describe('shared simple AI model controls', () => {
  it('offers two correction families and keeps direct image decisions behind a closed advanced disclosure', () => {
    const { node, props } = render({ method: 'decision' });
    const method = node.querySelector<HTMLSelectElement>('#evaluation-correction-method')!;
    expect(Array.from(method.options).map(option => option.value)).toEqual(['generative', 'decision']);
    const direct = node.querySelector<HTMLInputElement>('#evaluation-direct-decision')!;
    expect(direct.closest('details')!.open).toBe(false);
    act(() => direct.click());
    expect(props.onMethod).toHaveBeenCalledWith('visual-decision');
    expect(node.querySelector('[role="status"]')?.textContent).toContain('ocr → décisions : tev1:4b');
  });

  it('has no invented decision catalogue before discovery, retaining only the saved identifier as text', () => {
    const { node } = render({ apiCompatible: true, responses: true, decisionModel: 'previous-id' });
    const decision = node.querySelector<HTMLInputElement>('#evaluation-decision-model')!;
    expect(decision.tagName).toBe('INPUT');
    expect(decision.value).toBe('previous-id');
    expect(node.textContent).toContain('Aucun catalogue détecté');
  });

  it('preserves manually entered model names when the server lists different models', () => {
    const { node } = render({ models: [{ name: 'other' }] });
    expect(node.querySelector<HTMLSelectElement>('#evaluation-analysis-model')!.value).toBe('qwen');
    expect(node.querySelector<HTMLSelectElement>('#evaluation-decision-model')!.value).toBe('tev1:4b');
  });

  it('separates newly detected decision checkpoints and enables manual decision identifiers independently', () => {
    const { node, props } = render({ apiCompatible: true, responses: true, decisionModel: 'pplx-decider-flash-v1.2',
      models: [{ name: 'qwen', decision: false }, { name: 'pplx-decider-flash-v1.2', decision: true, decisionInferred: true, vision: true },
        { name: 'unknown-decision', decision: true, vision: true }] });
    const generator = node.querySelector<HTMLSelectElement>('#evaluation-analysis-model')!;
    const decider = node.querySelector<HTMLSelectElement>('#evaluation-decision-model')!;
    expect(Array.from(generator.options).map(o => o.value)).toEqual(['', 'qwen']);
    expect(Array.from(decider.options).map(o => o.value)).toEqual(['', 'pplx-decider-flash-v1.2', 'unknown-decision']);
    expect(node.textContent).toContain('non confirmé par le catalogue natif');
    const manual = decider.closest('.evaluation-config-field')!.querySelector<HTMLButtonElement>('button')!;
    act(() => manual.click());
    expect(node.querySelector('#evaluation-decision-model')?.tagName).toBe('INPUT');
    expect(node.querySelector('#evaluation-analysis-model')?.tagName).toBe('SELECT');
    expect(props.onDecisionModel).not.toHaveBeenCalled();
  });

  it('shows a missing decision model and incompatible provider without silently changing family', () => {
    const { node, props } = render({ method: 'decision', decisionModel: '', apiCompatible: true });
    expect(node.textContent).toContain('Choisissez un modèle décisionnel');
    expect(node.textContent).toContain('nécessite Ollama ou LM Studio local');
    expect(props.onMethod).not.toHaveBeenCalled();
  });

  it('exposes a single reasoning choice for Ollama', () => {
    const { node, props } = render({ prefix: 'ai' });
    const select = node.querySelector<HTMLSelectElement>('#ai-reasoning')!;
    expect(select.value).toBe('off');
    expect(Array.from(select.options).map(option => option.value)).toEqual(['off', 'on']);
    act(() => { select.value = 'on'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(props.onReasoning).toHaveBeenCalledWith('on');
    expect(render({ disabled: true }).node.querySelector<HTMLSelectElement>('#evaluation-reasoning')?.disabled).toBe(true);
  });

  it('uses the native model metadata and keeps the saved choice readable', () => {
    const { node } = render({ apiCompatible: true, nativeChat: true, analysisThinking: true, analysisReasoningEffort: 'high',
      models: [{ name: 'qwen', vision: true, tools: true, reasoningOptions: ['off', 'low'] }] });
    const select = node.querySelector<HTMLSelectElement>('#evaluation-reasoning')!;
    expect(select.value).toBe('high');
    expect(Array.from(select.options).map(option => option.value)).toEqual(['default', 'off', 'low', 'high']);
    expect(node.textContent).toContain('vision prise en charge');
    expect(node.textContent).toContain('modèle entraîné aux appels d’outils');
  });

  it('restores direct-image mode and visibly identifies an unsupported image model', () => {
    const { node } = render({ method: 'visual-decision' });
    expect(node.querySelector<HTMLInputElement>('#evaluation-direct-decision')!.checked).toBe(true);
    expect(node.textContent).toContain('Ce modèle n’est pas reconnu comme compatible');
  });

  it('restores the no-parameter choice for Instruct and exposes an explicit Thinking OFF on Responses', () => {
    const instruct = render({ apiCompatible: true, omitReasoningParameter: true, analysisThinking: true });
    expect(instruct.node.querySelector<HTMLSelectElement>('#evaluation-reasoning')?.value).toBe('default');
    const responses = render({ apiCompatible: true, responses: true, analysisThinking: false });
    const select = responses.node.querySelector<HTMLSelectElement>('#evaluation-reasoning')!;
    expect(select.value).toBe('off');
    expect(select.querySelector('option[value="off"]')?.textContent).toBe('Désactivé');
    expect(responses.node.textContent).toContain('reasoning.effort = none');
    act(() => { select.value = 'default'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(responses.props.onReasoning).toHaveBeenCalledWith('default');
  });

  it('offers no imposed context threshold and supports a native Chat override', () => {
    const onContextLength = vi.fn();
    const { node } = render({ apiCompatible: true, nativeChat: true, onContextLength });
    const input = node.querySelector<HTMLInputElement>('#evaluation-context-length')!;
    expect(input.value).toBe('');
    expect(input.placeholder).toContain('Automatique');
    expect(node.textContent).toContain('aucun context_length envoyé');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '16384');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onContextLength).toHaveBeenCalledWith(16384);
    const preset = render({ apiCompatible: true, nativeChat: true, contextLength: 16384 });
    expect(preset.node.querySelector<HTMLInputElement>('#evaluation-context-length')?.value).toBe('16384');
    expect(render({ apiCompatible: true, nativeChat: false }).node.querySelector('#evaluation-context-length')).toBeNull();
    expect(render({ apiCompatible: false, nativeChat: false }).node.querySelector('#evaluation-context-length')).toBeNull();
    expect(render({ apiCompatible: true, nativeChat: true, disabled: true })
      .node.querySelector<HTMLInputElement>('#evaluation-context-length')?.disabled).toBe(true);
  });

  it('offers a configurable zoom budget only for LM Studio generative mode', () => {
    const onSmartZoom = vi.fn();
    const onSmartZoomBudget = vi.fn();
    const { node } = render({ apiCompatible: true, nativeChat: true,
      smartZoom: true, onSmartZoom, onSmartZoomBudget });
    const checkbox = node.querySelector<HTMLInputElement>('#evaluation-smart-zoom')!;
    expect(checkbox.checked).toBe(true);
    const budget = node.querySelector<HTMLSelectElement>('#evaluation-zoom-budget')!;
    expect(budget.value).toBe('6');
    expect(Array.from(budget.options).map(option => Number(option.value))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    act(() => { budget.value = '8'; budget.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onSmartZoomBudget).toHaveBeenCalledWith(8);
    expect(render({ apiCompatible: true, responses: true, smartZoom: true, smartZoomBudget: 4 }).node.querySelector<HTMLSelectElement>('#evaluation-zoom-budget')?.value).toBe('4');
    expect(render({ apiCompatible: true, responses: true, smartZoom: false }).node.querySelector('#evaluation-zoom-budget')).toBeNull();
    act(() => checkbox.click());
    expect(onSmartZoom).toHaveBeenCalledWith(false);
    expect(render({ apiCompatible: true, nativeChat: false }).node.querySelector('#evaluation-smart-zoom')).toBeNull();
    expect(render({ apiCompatible: false, nativeChat: true }).node.querySelector('#evaluation-smart-zoom')).toBeNull();
    expect(render({ apiCompatible: true, nativeChat: true, method: 'decision' }).node.querySelector('#evaluation-smart-zoom')).toBeNull();
    expect(render({ apiCompatible: true, nativeChat: true, disabled: true })
      .node.querySelector<HTMLInputElement>('#evaluation-smart-zoom')?.disabled).toBe(true);
  });

});
