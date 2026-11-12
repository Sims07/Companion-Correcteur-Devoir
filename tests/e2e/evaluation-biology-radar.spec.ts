import { expect, test } from '@playwright/test';
import { defaultAiModelConfiguration } from '../../src/domain/aiModelProfiles.ts';

test('evaluation opens on both radars and keeps the chosen LLM across tests and reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(cfg => localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify(
    ['alpha', 'beta'].map(name => ({ id: name, name, mode: 'single', updatedAt: new Date().toISOString(),
      configuration: { ...cfg, analysisModel: name, visionModel: name } })))), defaultAiModelConfiguration);
  await page.reload();
  const open = page.getByRole('button', { name: 'Évaluer les modèles' });
  await open.click();
  const home = page.getByRole('region', { name: 'Tableau de bord des radars' });
  const nav = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await expect(nav.getByRole('button', { name: 'Radars' })).toHaveAttribute('aria-current','page');
  await home.getByLabel('Choisir un LLM').selectOption('beta');
  await expect(home.getByText('À évaluer', { exact: true })).toHaveCount(2);
  await expect(home.getByRole('img')).toHaveCount(2);
  await nav.getByRole('button', { name: 'Tests' }).click();
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })).toContainText('beta');
  await nav.getByRole('button', { name: 'Campagnes' }).click();
  await expect(page.getByRole('region', { name: 'Campagnes d’évaluation' })).toBeVisible();
  await page.reload();
  await open.click();
  await expect(home.getByLabel('Choisir un LLM')).toHaveValue('beta');
  await page.setViewportSize({ width: 390, height: 844 });
  const bio = home.getByRole('article', { name: 'Biologie' });
  await bio.getByRole('button', { name: 'Afficher le graphique' }).click();
  await expect(bio.getByRole('img')).toBeVisible();
  await expect(home.getByRole('article', { name: 'Schémas scientifiques' }).getByRole('img')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({path:'test-results/radars-mobile.png', fullPage:true});
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'test-results/radars-desktop.png', fullPage:true});
});
