import { test, expect } from '@playwright/test';

test('classroom synthetic suite is separated from A/B/C and D/E and ready for one-click runs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' })
    .getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();

  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await panel.getByRole('tab', { name: /Cas de classe synthétiques/ }).click();
  const cards = panel.getByRole('region', { name: 'Schémas de référence intégrés' });
  await expect(cards.locator('.diagram-fixture-card')).toHaveCount(3);
  await expect(cards.getByText('R1 — présentation soignée, étape oubliée')).toBeVisible();
  await expect(cards.getByText('R2 — confusions de structures et de pointage')).toBeVisible();
  await expect(cards.getByText('R3 — erreurs propres à la métaphase')).toBeVisible();
  await expect(cards.getByText(/ne constitue pas le corrigé de cette nouvelle image/)).toHaveCount(3);
  await expect(cards.getByText('5.3/10 attendu')).toBeVisible();
  await expect(cards.getByText('6.67/10 attendu')).toBeVisible();
  const images = cards.locator('img');
  await expect(images).toHaveCount(3);
  await expect.poll(async () => images.evaluateAll(nodes =>
    nodes.filter(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0).length
  )).toBe(3);
  await expect(images.first()).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect(cards.getByRole('button', { name: 'Tester ce schéma' })).toHaveCount(3);
  // No configured profile: a real test must not claim to run.
  await expect(panel.getByRole('button', { name: 'Tester les 3 cas de classe synthétiques' })).toBeDisabled();
});
