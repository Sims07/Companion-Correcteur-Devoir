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
  const props = { prefix: 'evaluation' as const, models: [], generativeModel: 'qwen', decisionModel: 'tev1:4b', visionModel: 'ocr', method: 'generative' as const, apiCompatible: false, analysisThinking: false, analysisReasoningEffort: 'medium' as const, onAnalysisThinking: vi.fn(), onAnalysisReasoningEffort: vi.fn(), onGenerativeModel: vi.fn(), onDecisionModel: vi.fn(), onMethod: vi.fn(), ...overrides };
  act(() => root.render(createElement(AiModelRoleFields, props)));
  return { node, props };
}

describe('shared simple AI model controls', () => {
  it('offers two correction families and keeps direct image decisions behind a closed advanced disclosure', () => {
    const { node, props } = render({ method: 'decision' });
    const method = node.querySelector<HTMLSelectElement>('#evaluation-correction-method')!;
    expect(Array.from(method.options).map(option => option.value)).toEqual(['generative', 'decision']);
    expect(node.querySelector('details')!.open).toBe(false);
    const direct = node.querySelector<HTMLInputElement>('#evaluation-direct-decision')!;
    act(() => direct.click());
    expect(props.onMethod).toHaveBeenCalledWith('visual-decision');
    expect(node.querySelector('[role="status"]')?.textContent).toContain('ocr → décisions : tev1:4b');
  });

  it('preserves manually entered model names when the server lists different models', () => {
    const { node } = render({ models: ['other'] });
    expect(node.querySelector<HTMLSelectElement>('#evaluation-analysis-model')!.value).toBe('qwen');
    expect(node.querySelector<HTMLSelectElement>('#evaluation-decision-model')!.value).toBe('tev1:4b');
  });

  it('shows a missing decision model and incompatible provider without silently changing family', () => {
    const { node, props } = render({ method: 'decision', decisionModel: '', apiCompatible: true });
    expect(node.textContent).toContain('Choisissez un modèle décisionnel');
    expect(node.textContent).toContain('nécessite une connexion Ollama');
    expect(props.onMethod).not.toHaveBeenCalled();
  });

  it('shows Thinking beside model selection, announces changes and passes the new value to the editor', () => {
    const { node, props } = render({ prefix: 'ai' });
    const checkbox = node.querySelector<HTMLInputElement>('#ai-analysis-thinking')!;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(false);
    expect(node.querySelector('#ai-analysis-thinking-status')?.textContent).toContain('désactivé');
    act(() => checkbox.click());
    expect(props.onAnalysisThinking).toHaveBeenCalledWith(true);
    expect(node.querySelector('#ai-analysis-thinking-status')).not.toBeNull();

    const enabled = render({ prefix: 'ai', analysisThinking: true });
    expect(enabled.node.querySelector<HTMLInputElement>('#ai-analysis-thinking')!.checked).toBe(true);
    expect(enabled.node.querySelector('#ai-analysis-thinking-status')?.textContent).toContain('activé');
  });

  it('allows Thinking on OpenAI-compatible APIs and explains that provider support may vary', () => {
    const { node, props } = render({ apiCompatible: true, analysisThinking: true });
    const checkbox = node.querySelector<HTMLInputElement>('#evaluation-analysis-thinking')!;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(false);
    expect(node.querySelector('#evaluation-analysis-thinking-status')?.textContent).toContain('Thinking demandé');
    act(() => checkbox.click());
    expect(props.onAnalysisThinking).toHaveBeenCalledWith(false);

    const disabled = render({ apiCompatible: true, analysisThinking: false });
    expect(disabled.node.querySelector<HTMLInputElement>('#evaluation-analysis-thinking')?.disabled).toBe(false);
    expect(disabled.node.querySelector('#evaluation-analysis-thinking-status')?.textContent).toContain('désactivé demandé');
  });

  it('selects a compatible reasoning effort and hides it when Thinking is OFF', () => {
    const { node, props } = render({ apiCompatible: true, analysisThinking: true, analysisReasoningEffort: 'high' });
    const level = node.querySelector<HTMLSelectElement>('#evaluation-reasoning-effort')!;
    expect(Array.from(level.options).map(option => option.value)).toEqual(['low', 'medium', 'high']);
    expect(level.value).toBe('high');
    expect(node.querySelector('#evaluation-analysis-thinking-status')?.textContent).toContain('high');
    act(() => { level.value = 'low'; level.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(props.onAnalysisReasoningEffort).toHaveBeenCalledWith('low');
    expect(render({ apiCompatible: true, analysisThinking: false }).node.querySelector('#evaluation-reasoning-effort')).toBeNull();
    expect(render({ apiCompatible: false, analysisThinking: true }).node.querySelector('#evaluation-reasoning-effort')).toBeNull();
    expect(render({ apiCompatible: true, analysisThinking: true, disabled: true }).node.querySelector<HTMLSelectElement>('#evaluation-reasoning-effort')?.disabled).toBe(true);
  });

  it('disables Thinking while a model evaluation is busy', () => {
    const { node } = render({ disabled: true });
    expect(node.querySelector<HTMLInputElement>('#evaluation-analysis-thinking')?.disabled).toBe(true);
  });

  it('restores direct-image mode and visibly identifies an unsupported image model', () => {
    const { node } = render({ method: 'visual-decision' });
    expect(node.querySelector<HTMLInputElement>('#evaluation-direct-decision')!.checked).toBe(true);
    expect(node.textContent).toContain('Ce modèle n’est pas reconnu comme compatible');
  });

  it('lets compatible Instruct profiles omit reasoning without disabling the model itself', () => {
    const onOmitReasoningParameter = vi.fn();
    const { node } = render({
      apiCompatible: true, omitReasoningParameter: true, analysisThinking: true,
      onOmitReasoningParameter,
    });
    const omission = node.querySelector<HTMLInputElement>('#evaluation-omit-reasoning')!;
    expect(omission.checked).toBe(true);
    expect(node.querySelector<HTMLInputElement>('#evaluation-analysis-thinking')?.disabled).toBe(true);
    expect(node.querySelector('#evaluation-reasoning-effort')).toBeNull();
    expect(node.querySelector('#evaluation-analysis-thinking-status')?.textContent).toContain('Aucun paramètre Reasoning');
    act(() => omission.click());
    expect(onOmitReasoningParameter).toHaveBeenCalledWith(false);
    const defaultMode = render({ apiCompatible: true, omitReasoningParameter: false, analysisThinking: true });
    expect(defaultMode.node.querySelector<HTMLInputElement>('#evaluation-analysis-thinking')?.disabled).toBe(false);
    expect(defaultMode.node.querySelector('#evaluation-reasoning-effort')).not.toBeNull();
    expect(render({ apiCompatible: false }).node.querySelector('#evaluation-omit-reasoning')).toBeNull();
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

  it('offers bounded zoom only for LM Studio native chat in generative mode', () => {
    const onSmartZoom = vi.fn();
    const { node } = render({ apiCompatible: true, nativeChat: true,
      smartZoom: true, onSmartZoom });
    const checkbox = node.querySelector<HTMLInputElement>('#evaluation-smart-zoom')!;
    expect(checkbox.checked).toBe(true);
    expect(node.textContent).toContain('2 par critère maximum');
    act(() => checkbox.click());
    expect(onSmartZoom).toHaveBeenCalledWith(false);
    expect(render({ apiCompatible: true, nativeChat: false }).node.querySelector('#evaluation-smart-zoom')).toBeNull();
    expect(render({ apiCompatible: false, nativeChat: true }).node.querySelector('#evaluation-smart-zoom')).toBeNull();
    expect(render({ apiCompatible: true, nativeChat: true, method: 'decision' }).node.querySelector('#evaluation-smart-zoom')).toBeNull();
    expect(render({ apiCompatible: true, nativeChat: true, disabled: true })
      .node.querySelector<HTMLInputElement>('#evaluation-smart-zoom')?.disabled).toBe(true);
  });

});
