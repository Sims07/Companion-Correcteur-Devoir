import { expect, test } from '@playwright/test';

test('teacher correction stays simple while the AI tools remain available for troubleshooting', async ({ page }) => {
  await page.goto('/');

  const primaryNavigation = page.getByRole('group', { name: 'Mode d’interface' });
  await expect(primaryNavigation.getByRole('button')).toHaveCount(2);
  await expect(primaryNavigation.getByRole('button', { name: 'Correction' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation', { name: 'Navigation des outils IA' })).toHaveCount(0);

  await primaryNavigation.getByRole('button', { name: 'Outils IA' }).click();
  const tools = page.getByRole('navigation', { name: 'Navigation des outils IA' });
  await expect(tools.getByRole('button')).toHaveCount(3);
  await expect(tools.getByRole('button', { name: /Observabilité/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Observabilité' })).toBeVisible();

  await tools.getByRole('button', { name: /Inspecteur réseau/ }).click();
  await expect(page.getByRole('heading', { name: 'Inspecteur réseau' })).toBeVisible();
  await expect(tools.getByRole('button', { name: /Inspecteur réseau/ })).toHaveAttribute('aria-current', 'page');

  await tools.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await expect(page.getByRole('heading', { name: 'Évaluation des modèles' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Type d’évaluation' })).toBeVisible();

  await primaryNavigation.getByRole('button', { name: 'Correction' }).click();
  await expect(page.getByRole('navigation', { name: 'Navigation des outils IA' })).toHaveCount(0);
  await expect(primaryNavigation.getByRole('button', { name: 'Correction' })).toHaveAttribute('aria-pressed', 'true');
});
