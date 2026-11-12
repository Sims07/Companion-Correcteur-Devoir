import { expect, test } from '@playwright/test';

test('all scientific protocol buttons are reachable before the image catalog, on desktop and mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: 'Schémas scientifiques' }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques', exact: true });
  const choices = panel.getByRole('tablist', { name: 'Protocoles automatiques des schémas scientifiques' });
  await expect(choices.getByRole('tab')).toHaveCount(4);
  await expect(panel.getByText('3 schémas · présentation, légendes et justesse')).toBeVisible();
  for (const [label, action] of [
    [/Qualité graphique/, /Tester les 3 schémas en un clic/],
    [/Sens des flèches/, /Tester les flèches D\/E en un clic/],
    [/Compréhension biologique/, /Tester les 6 variantes sémantiques/],
    [/Graphe des relations/, /Extraire les relations des 6 schémas/],
  ] as const) {
    await choices.getByRole('tab', { name: label }).click();
    await expect(panel.getByRole('button', { name: action })).toBeVisible();
    await expect(choices.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true');
  }
  await choices.getByRole('tab', { name: /Qualité graphique/ }).click();
  await expect(panel.locator('.diagram-lab-explanation')).toHaveCount(2);
  await expect(panel.locator('.diagram-lab-explanation').first()).not.toHaveAttribute('open', '');
  const positions = await panel.evaluate((root) => {
    const controls = root.querySelector('#diagram-fixture-repeat-count');
    const preview = root.querySelector('.diagram-fixture-grid');
    return { controls: controls?.getBoundingClientRect().top ?? 0, preview: preview?.getBoundingClientRect().top ?? 0 };
  });
  expect(positions.controls).toBeLessThan(positions.preview);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(choices.getByRole('tab')).toHaveCount(4);
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return {
      viewportWidth: width,
      scrollWidth: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll<HTMLElement>('body *')]
        .map((element) => ({ element, right: element.getBoundingClientRect().right }))
        .filter(({ element, right }) => right > width + 2 && getComputedStyle(element).display !== 'none')
        .sort((a, b) => b.right - a.right)
        .slice(0, 14)
        .map(({ element, right }) => ({
          selector: element.tagName.toLowerCase() + (element.id ? '#' + element.id : '') +
            (typeof element.className === 'string' ? '.' + element.className.trim().split(/\\s+/).slice(0, 3).join('.') : ''),
          right: Math.round(right),
        })),
    };
  });
  expect(overflow.scrollWidth, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(overflow.viewportWidth);
});

test('biology protocol puts the one-click method comparison above reference detail', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: 'Biologie' }).click();
  const panel = page.getByRole('region', { name: 'Protocole de test guidé' });
  await expect(panel.getByRole('group', { name: 'Objectif du protocole de biologie' }).getByRole('button')).toHaveCount(3);
  await expect(panel.locator('[aria-label="Protocole variante B par question"] .pilot-evaluation-protocol-notes')).not.toHaveAttribute('open', '');
  const positions = await panel.evaluate((root) => {
    const launch = root.querySelector('[aria-label="Protocole variante B par question"] .pilot-evaluation-actions');
    const reference = root.querySelector('[aria-label="Protocole variante B par question"] .pilot-evaluation-reference');
    return { launch: launch?.getBoundingClientRect().top ?? 0, reference: reference?.getBoundingClientRect().top ?? 0 };
  });
  expect(positions.launch).toBeLessThan(positions.reference);
});
