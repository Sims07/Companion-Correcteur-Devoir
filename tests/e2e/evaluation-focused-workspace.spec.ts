import { expect, test } from '@playwright/test';

test('evaluation starts with one compact workspace rather than stacked cards', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();

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

  await expect(page.locator('.evaluation-selection-block, .evaluation-config-editor')).toHaveCount(0);
  const models = page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' });
  await expect(models).toBeVisible();
  await models.getByRole('button', { name: 'Gérer les configurations' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gérer les configurations IA' });
  await expect(dialog.getByRole('group', { name: 'Configurations à exécuter' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await families.getByRole('button', { name: 'Schémas scientifiques' }).click();
  await expect(page.getByRole('region', { name: 'Protocole schémas scientifiques', exact: true })).toBeVisible();
  await views.getByRole('button', { name: 'Campagnes de test' }).click();
  await expect(views.getByRole('button', { name: 'Campagnes de test' })).toHaveAttribute('aria-current', 'page');
  await views.getByRole('button', { name: 'Tests' }).click();
  await expect(families.getByRole('button', { name: 'Schémas scientifiques' })).toHaveAttribute('aria-pressed', 'true');
  await families.getByRole('button', { name: 'Biologie' }).click();
  await expect(page.getByRole('region', { name: 'Protocole de test guidé' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(families.getByRole('button')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
