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
  await expect(cards.getByText(/concerne uniquement le nouveau dessin/)).toHaveCount(3);
  await expect(cards.getByText('7.16/10 attendu')).toBeVisible();
  await expect(cards.getByText('8.01/10 attendu')).toBeVisible();
  const images = cards.locator('img');
  await expect(images).toHaveCount(3);
  await expect.poll(async () => images.evaluateAll(nodes =>
    nodes.filter(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0).length
  )).toBe(3);
  for (const image of await images.all()) {
    await expect(image).toHaveAttribute('src', /classroom-mitosis-r[123]\.webp/);
  }
  const dimensions = await images.evaluateAll(elements => elements.map(element => {
    const img = element as HTMLImageElement;
    return { width: img.naturalWidth, height: img.naturalHeight };
  }));
  expect(dimensions).toEqual([{ width: 744, height: 510 }, { width: 746, height: 509 }, { width: 814, height: 487 }]);
  await expect(cards.getByRole('button', { name: 'Tester ce schéma' })).toHaveCount(3);
  // No configured profile: a real test must not claim to run.
  await expect(panel.getByRole('button', { name: 'Tester les 3 cas de classe synthétiques' })).toBeDisabled();
});
