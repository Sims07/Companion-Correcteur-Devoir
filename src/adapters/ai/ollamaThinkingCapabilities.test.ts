import { describe, expect, it, vi } from 'vitest';
import { detectOllamaDiagramThinkSetting, selectOllamaThinkSetting } from './ollamaThinkingCapabilities.ts';

describe('Découverte Ollama Think sans noms de modèles codés en dur', () => {
  it('accepte les modèles à bascule booléenne, indépendamment du nom ou de la taille', () => {
    for (const model of ['qwen3.5:4b', 'qwen3.5:9b', 'other-vision:27b']) {
      const show = { model, capabilities: ['completion', 'vision'], thinking: { values: [false, true], default: false } };
      expect(selectOllamaThinkSetting(show)).toBe(true);
    }
  });

  it('choisit le niveau natif déclaré par un modèle avec niveaux nommés', () => {
    expect(selectOllamaThinkSetting({
      capabilities: ['vision'], thinking: { values: ['low', 'medium', 'high'], default: 'high' },
    })).toBe('high');
    expect(selectOllamaThinkSetting({ thinking: { values: ['low', 'medium', 'high'] } })).toBe('medium');
    expect(selectOllamaThinkSetting({ thinking: { values: ['low', 'high'] } })).toBe('low');
  });

  it('distingue une capacité explicitement absente des métadonnées anciennes', () => {
    expect(() => selectOllamaThinkSetting({ thinking: { values: [false], default: false } }))
      .toThrow(/indisponible/);
    expect(() => selectOllamaThinkSetting({ capabilities: ['completion'] }))
      .toThrow(/Vision/);
    // Older Ollama releases do not publish thinking metadata; attempt a
    // boolean request without claiming the model actually thought.
    expect(selectOllamaThinkSetting({ model_info: {} })).toBe(true);
    expect(() => selectOllamaThinkSetting(null)).toThrow(/invalides/);
  });

  it('sonde seulement /api/show local sans image ni prompt ni copie', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      capabilities: ['completion', 'vision'],
      thinking: { values: [false, true], default: false },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const chosen = await detectOllamaDiagramThinkSetting('http://localhost:11434', 'qwen3.5:9b', fetchImpl as unknown as typeof fetch);
    expect(chosen).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/show');
    expect(JSON.parse(String(init.body))).toEqual({ model: 'qwen3.5:9b' });
    expect(String(init.body)).not.toMatch(/image|base64|question|barème/);
    await expect(detectOllamaDiagramThinkSetting('https://ollama.example', 'qwen3.5:9b',
      fetchImpl as unknown as typeof fetch)).rejects.toThrow(/local/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('échoue clairement si le serveur ne peut pas annoncer les capacités Think', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 503 }));
    await expect(detectOllamaDiagramThinkSetting('http://127.0.0.1:11434', 'vision-model',
      fetchImpl as unknown as typeof fetch)).rejects.toThrow(/HTTP 503/);
  });
});
