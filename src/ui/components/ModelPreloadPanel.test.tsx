// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelPreloadPanel } from './ModelPreloadPanel.tsx';

describe('ModelPreloadPanel', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    host?.remove();
    host = null;
  });

  async function render(loadModel = vi.fn().mockResolvedValue(undefined)) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root?.render(
      <ModelPreloadPanel endpoint="https://ai.example/v1/chat/completions" apiKey="secret" busy={false} loadModel={loadModel} />,
    ));
    return { loadModel, input: host.querySelector<HTMLInputElement>('#model-preload-name')!, button: host.querySelector<HTMLButtonElement>('button')! };
  }

  async function typeModel(input: HTMLInputElement, value: string) {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('starts with the former Saluki model and sends an arbitrary model selected by the user', async () => {
    const { input, button, loadModel } = await render();
    expect(input.value).toBe('saluki-27b');
    await typeModel(input, '  qwen3.5:27b  ');
    expect(input.value).toBe('  qwen3.5:27b  ');
    await act(async () => button.click());
    expect(loadModel).toHaveBeenCalledWith({
      endpoint: 'https://ai.example/v1/chat/completions', apiKey: 'secret', model: 'qwen3.5:27b',
    });
    expect(host?.textContent).toContain('Le serveur a confirmé le chargement de « qwen3.5:27b ».');
    expect(host?.textContent).toContain('Recharger ce modèle');
  });

  it('does not allow requests without a model name', async () => {
    const { input, button, loadModel } = await render();
    await typeModel(input, '   ');
    expect(button.disabled).toBe(true);
    expect(loadModel).not.toHaveBeenCalled();
  });

  it('reports the server error and never claims the model is loaded on failure', async () => {
    const loadModel = vi.fn().mockRejectedValue(new Error('Modèle non trouvé'));
    const { button } = await render(loadModel);
    await act(async () => button.click());
    expect(host?.textContent).toContain('Modèle non trouvé');
    expect(host?.textContent).toContain('Non chargé');
    expect(host?.textContent).not.toContain('Le serveur a confirmé');
  });
});
