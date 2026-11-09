// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiModelRoleFields } from '../../src/ui/components/AiModelRoleFields.tsx';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const containers: Array<{ root: ReturnType<typeof createRoot>; node: HTMLDivElement }> = [];
afterEach(() => { for (const { root, node } of containers.splice(0)) { act(() => root.unmount()); node.remove(); } });
function render(overrides = {}) {
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node); containers.push({ root, node });
  const props = { prefix: 'evaluation' as const, models: [], generativeModel: 'qwen', decisionModel: 'tev1:4b', visionModel: 'ocr', method: 'generative' as const, apiCompatible: false, onGenerativeModel: vi.fn(), onDecisionModel: vi.fn(), onMethod: vi.fn(), ...overrides };
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

  it('restores direct-image mode and visibly identifies an unsupported image model', () => {
    const { node } = render({ method: 'visual-decision' });
    expect(node.querySelector<HTMLInputElement>('#evaluation-direct-decision')!.checked).toBe(true);
    expect(node.textContent).toContain('Ce modèle n’est pas reconnu comme compatible');
  });
});
