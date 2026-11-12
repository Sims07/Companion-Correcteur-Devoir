import { openCustomTests } from './helpers/evaluation-models.ts';
import { expect, test } from '@playwright/test';

test('radar opens on LLM selection and score, while archive tools stay with campaigns', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);

  const navigation = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await navigation.getByRole('button', { name: 'Radars' }).click();
  await page.getByRole('article', { name: 'Schémas scientifiques' }).getByRole('button', { name: 'Détail du radar' }).click();
  const radar = page.getByRole('region', { name: 'Radar des candidats scientifiques' });

  await expect(radar).toBeVisible();
  await expect(radar.getByLabel('Choisir un LLM')).toBeVisible();
  await expect(page.locator('.diagram-lab-history-heading, .diagram-radar-intro')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Importer un ancien JSON' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Actualiser', exact: true })).toHaveCount(0);

  const order = await radar.evaluate((element) => ({
    selector: element.querySelector('.diagram-radar-model-pickers')?.getBoundingClientRect().top ?? Infinity,
    options: element.querySelector('.diagram-radar-toolbar')?.getBoundingClientRect().top ?? -Infinity,
  }));
  expect(order.selector).toBeLessThan(order.options);

  await navigation.getByRole('button', { name: 'Campagnes' }).click();
  await page.getByRole('button', { name: 'Archives scientifiques' }).click();
  await expect(page.getByRole('heading', { name: 'Campagnes de test' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importer un ancien JSON' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actualiser', exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await navigation.getByRole('button', { name: 'Radars' }).click();
  await page.getByRole('article', { name: 'Schémas scientifiques' }).getByRole('button', { name: 'Détail du radar' }).click();
  await expect(radar.getByLabel('Choisir un LLM')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
