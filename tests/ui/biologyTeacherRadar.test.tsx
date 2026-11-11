// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { defaultAiModelConfiguration } from '../../src/domain/aiModelProfiles.ts';
import type { BiologyRadarObservation } from '../../src/domain/biologyTeacherRadar.ts';
import { BiologyTeacherRadar } from '../../src/ui/components/BiologyTeacherRadar.tsx';

const profiles = [{ id: 'qwen', name: 'Qwen', mode: 'single' as const,
  configuration: { ...defaultAiModelConfiguration, analysisModel: 'qwen:4b',
    generativeModel: 'qwen:4b', correctionMethod: 'generative' as const },
  updatedAt: '2026-11-11T10:00:00Z' }];
const records: BiologyRadarObservation[] = ['A','B','C'].map((caseId, index) => ({
  id: 'item:' + caseId, profileId: 'qwen', profile: 'Qwen', model: 'qwen:4b',
  provider: 'ollama', method: 'generative', protocol: 'contract', caseId,
  recordedAt: '2026-11-11T10:00:00Z', status: 'success',
  score: [10,0,5][index]!, referenceScore: [10,0,5][index]!,
  decisions: Array.from({ length: 10 }, (_, i) => {
    const expected = index === 0 ? 1 : index === 1 ? 0 : i < 5 ? 1 : 0;
    return { id: 'p' + i, expected: expected as 0 | 1, awarded: expected };
  }),
}));

describe('biology teacher radar UI', () => {
  it('puts the professor score first, marks missing traps and launches the matching profile', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    const root = createRoot(mount);
    const onEvaluate = vi.fn();
    const onShowTests = vi.fn();
    await act(async () => root.render(createElement(BiologyTeacherRadar,
      { history: records, profiles, busy: false, onEvaluate, onShowTests })));
    expect(mount.querySelector('[aria-label="Résultat biologique du LLM"]')?.textContent).toContain('Indice partiel');
    expect(mount.querySelector('[aria-label="Résultat biologique du LLM"]')?.textContent).toContain('4 / 5');
    expect(mount.querySelector('[aria-label="Radar de correction biologique"]')?.textContent).toContain('Cas pièges');
    expect(mount.querySelector('[aria-label="Classement de correction biologique"]')?.textContent).toContain('Aucun classement définitif');
    const launch = [...mount.querySelectorAll('button')].find((item) => item.textContent === 'Évaluer le modèle')!;
    await act(async () => (launch as HTMLButtonElement).click());
    expect(onEvaluate).toHaveBeenCalledWith('qwen');
    const more = [...mount.querySelectorAll('button')].find((item) => item.textContent === 'Voir les tests biologiques')!;
    await act(async () => (more as HTMLButtonElement).click());
    expect(onShowTests).toHaveBeenCalledWith('repeatability');
    await act(async () => root.unmount());
    mount.remove();
  });

  it('never labels a configured but untested model as evaluated', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    const root = createRoot(mount);
    await act(async () => root.render(createElement(BiologyTeacherRadar, {
      history: [], profiles, busy: false, onEvaluate: vi.fn(), onShowTests: vi.fn(),
    })));
    expect(mount.textContent).toContain('0 / 5');
    expect(mount.textContent).toContain('—');
    await act(async () => root.unmount());
    mount.remove();
  });
});
