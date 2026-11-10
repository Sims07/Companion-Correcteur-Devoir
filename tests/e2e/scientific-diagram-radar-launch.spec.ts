import { expect, test } from '@playwright/test';
import { buildBlindVisualObservationReport } from '../../src/domain/scientificDiagramBlindGraph.ts';
import { DIAGRAM_SENSITIVITY_CASES } from '../../src/domain/scientificDiagramSensitivity.ts';
import { summarizeDiagramLabReport } from '../../src/domain/diagramLabHistory.ts';
import { defaultAiModelConfiguration } from '../../src/domain/aiModelProfiles.ts';

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
  await page.evaluate(async ({ entry, profile }) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([profile]));
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
  }, { entry, profile });
  await page.reload();
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  const nav = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await nav.getByRole('button', { name: 'Radar des candidats' }).click();
  const radar = page.getByRole('region', { name: 'Radar des candidats scientifiques' });
  await radar.getByRole('group', { name: 'Axe à examiner' }).getByRole('button', { name: /Qualité graphique/ }).click();
  await expect(radar.getByText('Non mesuré').first()).toBeVisible();
  await expect(radar.getByText(/Qualité graphique A\/B\/C · 1 passage/)).toBeVisible();

  await radar.getByRole('button', { name: 'Lancer le test manquant' }).click();
  await expect(nav.getByRole('button', { name: 'Tests' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ })).toHaveAttribute('aria-pressed', 'true');
  const running = page.getByRole('status', { name: 'Test lancé depuis le radar' });
  await expect(running).toBeVisible();
  await expect(running).toContainText('Vision à compléter');
  await expect(running).toContainText(/Batterie 1\/1|n’a pas terminé|Batteries terminées/);
  // No previously selected unrelated model is invoked by this shortcut.
  await expect(page.getByLabel('Configurations à exécuter').getByText('Vision à compléter')).toBeVisible();
  await nav.getByRole('button', { name: 'Radar des candidats' }).click();
  await expect(page.getByRole('region', { name: 'Radar des candidats scientifiques' })).toBeVisible();
});
