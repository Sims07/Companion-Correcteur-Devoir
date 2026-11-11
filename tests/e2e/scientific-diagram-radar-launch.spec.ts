import { expect, test } from '@playwright/test';
import { buildBlindVisualObservationReport } from '../../src/domain/scientificDiagramBlindGraph.ts';
import { DIAGRAM_SENSITIVITY_CASES } from '../../src/domain/scientificDiagramSensitivity.ts';
import { summarizeDiagramLabReport } from '../../src/domain/diagramLabHistory.ts';
import { defaultAiModelConfiguration } from '../../src/domain/aiModelProfiles.ts';
import { buildDiagramLabRadar } from '../../src/domain/diagramLabRadar.ts';
import { SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET } from '../../src/domain/scientificDiagramFixtures.ts';

const report = buildBlindVisualObservationReport(DIAGRAM_SENSITIVITY_CASES.map((item) => ({
  caseId: item.id, profileId: 'radar-prof', profileName: 'Vision à compléter',
  model: 'vision:4b', repetition: 1, status: 'success' as const, durationMs: 2000,
  observations: { ...item.gold }, arrowCount: 2, containmentCount: 1,
})), 1, '2026-11-10T12:00:00Z');

test('a missing radar axis leads directly to its automatic fixture battery on the same saved profile', async ({ page }) => {
  await page.goto('/');
  const entry = summarizeDiagramLabReport(report, 'finished');
  const profile = {
    id: 'radar-prof', name: 'Vision à compléter', mode: 'single', updatedAt: '2026-11-10T12:00:00Z',
    configuration: { ...defaultAiModelConfiguration, visionModel: 'vision:4b',
      analysisModel: 'vision:4b', generativeModel: 'vision:4b', correctionMethod: 'generative' },
  };
  const alternateProfile = { ...profile, id: 'radar-other', name: 'Autre configuration',
    configuration: { ...profile.configuration, visionModel: 'another:4b', analysisModel: 'another:4b',
      generativeModel: 'another:4b' } };
  await page.evaluate(async ({ entry, profile, alternateProfile }) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([profile, alternateProfile]));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('companion-correcteur-devoir', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('diagram-lab-archive', 'readwrite');
    tx.objectStore('diagram-lab-archive').put(entry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { entry, profile, alternateProfile });
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const nav = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await nav.getByRole('button', { name: 'Radar des candidats' }).click();
  const radar = page.getByRole('region', { name: 'Radar des candidats scientifiques' });
  await radar.getByLabel('Choisir un LLM').selectOption('another:4b');
  await radar.getByRole('group', { name: 'Axe à examiner' }).getByRole('button', { name: /Qualité graphique/ }).click();
  await expect(radar.getByText('Non mesuré').first()).toBeVisible();
  await expect(radar.getByText(/Qualité graphique A\/B\/C · 1 passage/)).toBeVisible();

  await radar.getByRole('button', { name: 'Lancer le test manquant' }).click();
  await expect(nav.getByRole('button', { name: 'Tests' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ })).toHaveAttribute('aria-pressed', 'true');
  const running = page.getByRole('status', { name: 'Dernière expérience lancée' });
  await expect(running).toBeVisible();
  await expect(running).toContainText('Autre configuration');
  await expect(running).toContainText('Schémas scientifiques · qualité graphique A/B/C');
  // No previously selected unrelated model is invoked by this shortcut.
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })).toContainText('Autre configuration');
  await nav.getByRole('button', { name: 'Radar des candidats' }).click();
  await expect(page.getByRole('region', { name: 'Radar des candidats scientifiques' }).getByLabel('Choisir un LLM'))
    .toHaveValue('another:4b');
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Radar des candidats' }).click();
  await expect(page.getByRole('region', { name: 'Radar des candidats scientifiques' }).getByLabel('Choisir un LLM'))
    .toHaveValue('another:4b');
});

test('evaluating a new model launches the four required batteries from one action', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((configuration) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
      id: 'new-radar-model', name: 'Nouveau modèle', mode: 'single', updatedAt: '2026-11-11T12:00:00Z',
      configuration: { ...configuration, visionModel: 'fresh:4b', analysisModel: 'fresh:4b',
        generativeModel: 'fresh:4b', correctionMethod: 'generative' },
    }]));
  }, defaultAiModelConfiguration);
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const nav = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await nav.getByRole('button', { name: 'Radar des candidats' }).click();
  const radar = page.getByRole('region', { name: 'Radar des candidats scientifiques' });
  await radar.getByLabel('Choisir un LLM').selectOption('fresh:4b');
  await expect(radar.getByText(/4 batteries de test à enchaîner automatiquement/)).toBeVisible();
  await radar.getByRole('button', { name: 'Évaluer le modèle' }).click();
  await expect(nav.getByRole('button', { name: 'Tests' })).toHaveAttribute('aria-current', 'page');
  const running = page.getByRole('status', { name: 'Dernière expérience lancée' });
  await expect(running).toBeVisible();
  await expect(running).toContainText('Schémas scientifiques');
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })).toContainText('Nouveau modèle');
});

test('qwen-like 6/8 radar targets A/B/C x3 to fill graphics and stability in one battery', async ({ page }) => {
  const model = 'vision:4b';
  const profile = {
    id: 'radar-prof', name: 'Vision à compléter', mode: 'single', updatedAt: '2026-11-11T14:40:00Z',
    configuration: { ...defaultAiModelConfiguration, visionModel: model,
      analysisModel: model, generativeModel: model, correctionMethod: 'generative' },
  };
  const makeRuns = (id: string, observations: Record<string, string>, graph = false) => [{
    profileId: profile.id, profileName: profile.name, model, repetition: 1, status: 'success',
    method: 'direct-image-generative', durationMs: 2000,
    observations: graph ? observations : Object.entries(observations).map(([key, choice]) => ({ key, choice })),
  }];
  const arrows = {
    format: 'companion-scientific-diagram-fixture-report', createdAt: '2026-11-11T14:39:00Z',
    plannedRepetitions: 1, localOnly: true, cases: (['D', 'E'] as const).map((id) => ({
      caseId: id, label: id, gold: { [SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET]: id === 'D' ? 'present' : 'absent' },
      // E was incorrectly accepted, leading to the 50/100 arrow score seen in the screenshot.
      experiments: makeRuns(id, { [SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET]: 'present' }),
      summaries: [],
    })),
  };
  const semantic = {
    format: 'companion-scientific-diagram-sensitivity-report',
    createdAt: '2026-11-11T14:38:00Z', plannedRepetitions: 1, localOnly: true,
    promptModes: ['standard'], statistics: [],
    cases: DIAGRAM_SENSITIVITY_CASES.map((item) => ({
      caseId: item.id, label: item.label, promptMode: 'standard',
      experiments: makeRuns(item.id, item.gold),
    })),
  };
  const entries = [
    summarizeDiagramLabReport(report, 'finished'),
    summarizeDiagramLabReport(arrows as unknown as Parameters<typeof summarizeDiagramLabReport>[0], 'finished'),
    summarizeDiagramLabReport(semantic as unknown as Parameters<typeof summarizeDiagramLabReport>[0], 'finished'),
  ];
  const candidate = buildDiagramLabRadar(entries, 'model').find((item) => item.id === model);
  expect(candidate?.measured).toBe(6);
  expect(candidate?.axes.graphics.value).toBeNull();
  expect(candidate?.axes.stability.value).toBeNull();
  expect(candidate?.axes.arrows.value).toBe(50);

  await page.goto('/');
  await page.evaluate(async ({ entries: saved, profile: savedProfile }) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([savedProfile]));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('companion-correcteur-devoir', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('diagram-lab-archive', 'readwrite');
    for (const entry of saved) tx.objectStore('diagram-lab-archive').put(entry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { entries, profile });
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const nav = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await nav.getByRole('button', { name: 'Radar des candidats' }).click();
  const radar = page.getByRole('region', { name: 'Radar des candidats scientifiques' });
  await radar.getByLabel('Choisir un LLM').selectOption(model);
  await expect(radar.getByText(/2 caractéristique\(s\) à mesurer sur huit/)).toBeVisible();
  await expect(radar.getByText(/1 batterie de test à enchaîner automatiquement · Qualité graphique A\/B\/C · 3 passages/)).toBeVisible();
  await radar.getByRole('button', { name: 'Évaluer le modèle' }).click();
  await expect(nav.getByRole('button', { name: 'Tests' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('status', { name: 'Test lancé depuis le radar' }))
    .toContainText(/Batterie 1\/1|Batteries terminées|n’a pas terminé|Évaluation partielle/);
});
