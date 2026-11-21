import { expect, test } from '@playwright/test';
import { defaultAiModelConfiguration } from '../../src/shared/domain/aiModelProfiles.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURES } from '../../src/evaluation/domain/scientificDiagramFixtures.ts';
import { DIAGRAM_SENSITIVITY_CASES } from '../../src/evaluation/domain/scientificDiagramSensitivity.ts';
import { buildDiagramLabRadar, RADAR_PRESETS } from '../../src/evaluation/domain/diagramLabRadar.ts';
import type { DiagramLabArchiveEntry } from '../../src/evaluation/domain/diagramLabHistory.ts';

test('a completed LM Studio scientific evaluation keeps eight scores without endless speed retries after reload', async ({ page }) => {
  const model = 'google/gemma-4-12b-qat';
  const profile = {
    id: 'compatible-lm-studio', name: 'Gemma LM Studio', mode: 'single' as const,
    updatedAt: '2026-11-21T12:00:00Z',
    configuration: {
      ...defaultAiModelConfiguration, endpoint: 'https://localhost:1234',
      analysisModel: model, visionModel: model, generativeModel: model,
      correctionMethod: 'generative' as const, apiCompatible: true,
    },
  };
  const entries = (['reference', 'arrows', 'semantic', 'graph'] as const).map((protocol, index) => {
    const fixtures = protocol === 'reference'
      ? SCIENTIFIC_DIAGRAM_FIXTURES.filter(item => ['A', 'B', 'C'].includes(item.id))
      : protocol === 'arrows'
        ? SCIENTIFIC_DIAGRAM_FIXTURES.filter(item => ['D', 'E'].includes(item.id))
        : DIAGRAM_SENSITIVITY_CASES;
    const repetitions = protocol === 'reference' ? 3 : 1;
    const cases = fixtures.map(item => ({
      caseId: item.id, gold: item.gold, summaries: [], promptMode: 'standard',
      experiments: Array.from({ length: repetitions }, (_, i) => ({
        profileId: profile.id, profileName: profile.name, model,
        repetition: i + 1, status: 'success', method: 'direct-image-generative',
        provider: 'openai-compatible', zoom: false, durationMs: 12_000, providerDurationMs: null,
        observations: protocol === 'graph' ? { ...item.gold }
          : Object.entries(item.gold).map(([key, choice]) => ({ key, choice })),
      })),
    }));
    const createdAt = '2026-11-21T' + (10 + index) + ':00:00Z';
    return {
      id: 'lm-studio-' + protocol, protocol, state: 'finished' as const,
      createdAt, savedAt: createdAt, title: protocol, plannedRepetitions: repetitions,
      profiles: [profile.name], experimentCount: cases.length * repetitions,
      successfulCount: cases.length * repetitions, localOnly: true,
      trial: { id: 'lm-studio-test', method: 'image-direct-v1' as const,
        weights: RADAR_PRESETS.scientific },
      report: {
        format: protocol === 'graph' ? 'companion-scientific-diagram-blind-graph-report'
          : protocol === 'semantic' ? 'companion-scientific-diagram-sensitivity-report'
            : 'companion-scientific-diagram-fixture-report',
        version: 9, createdAt, plannedRepetitions: repetitions,
        cases, promptVariant: 'baseline', promptModes: ['standard'],
        statistics: [], summaries: [], localOnly: true,
      } as unknown as DiagramLabArchiveEntry['report'],
    };
  });
  expect(buildDiagramLabRadar(entries, 'model')[0]?.measured).toBe(8);
  await page.goto('/');
  await page.evaluate(async ({ profile, entries }) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([profile]));
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('companion-correcteur-devoir', 7);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = database.transaction('diagram-lab-archive', 'readwrite');
    for (const entry of entries) tx.objectStore('diagram-lab-archive').put(entry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  }, { profile, entries });

  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const radar = page.getByRole('region', { name: 'Tableau de bord des radars' });
  const science = radar.getByRole('article', { name: 'Schémas scientifiques' });
  await expect(science).toContainText('8/9 axes');
  await expect(science).toContainText('Vitesse non mesurable');
  await expect(science.getByRole('button', { name: 'Compléter les tests' })).toHaveCount(0);

  await science.getByRole('button', { name: 'Détail du radar' }).click();
  const detail = page.getByRole('region', { name: 'Radar des candidats scientifiques' });
  await expect(detail.getByText(/Performance non mesurable avec ce profil/)).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Compléter les axes manquants' })).toHaveCount(0);
});
