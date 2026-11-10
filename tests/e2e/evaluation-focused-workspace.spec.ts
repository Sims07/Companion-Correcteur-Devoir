import { expect, test } from '@playwright/test';

test('evaluation starts with one compact workspace rather than stacked cards', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();

  await expect(page.getByRole('heading', { name: 'Évaluer les modèles' })).toBeVisible();
  await expect(page.locator('.developer-tools-heading, .evaluation-config-workspace > .evaluation-stage-guidance')).toHaveCount(0);
  await expect(page.locator('.evaluation-page-header')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.evaluation-config-workspace')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.evaluation-provider-indicator')).toContainText(/Ollama local|API compatible OpenAI/);

  const views = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await expect(views.getByRole('button')).toHaveCount(3);
  await expect(views.getByRole('button', { name: 'Radar des candidats' })).toBeVisible();
  const families = page.getByRole('group', { name: 'Parcours de test' });
  await expect(families.getByRole('button')).toHaveCount(3);
  await expect(page.locator('.evaluation-journey-options button span, .evaluation-journey-options button small')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Que voulez-vous tester ?' })).toHaveCount(0);

  const configurations = page.locator('details.evaluation-selection-block');
  await expect(configurations.locator('summary')).toContainText('Configurations');
  await configurations.locator('summary').click();
  await expect(configurations).not.toHaveAttribute('open', '');
  await configurations.locator('summary').click();
  await expect(configurations).toHaveAttribute('open', '');

  await families.getByRole('button', { name: 'Schémas scientifiques' }).click();
  await expect(page.getByRole('region', { name: 'Protocole schémas scientifiques', exact: true })).toBeVisible();
  await views.getByRole('button', { name: 'Carnet de résultats' }).click();
  await expect(views.getByRole('button', { name: 'Carnet de résultats' })).toHaveAttribute('aria-current', 'page');
  await views.getByRole('button', { name: 'Tests' }).click();
  await expect(families.getByRole('button', { name: 'Schémas scientifiques' })).toHaveAttribute('aria-pressed', 'true');
  await families.getByRole('button', { name: 'Biologie' }).click();
  await expect(page.getByRole('region', { name: 'Protocole de test guidé' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(families.getByRole('button')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
