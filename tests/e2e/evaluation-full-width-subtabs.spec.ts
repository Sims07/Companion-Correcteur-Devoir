import { expect, test, type Locator } from '@playwright/test';

async function expectFullWidthSubnavigation(navigation: Locator, count: number) {
  await expect(navigation).toBeVisible();
  await expect(navigation.locator('button')).toHaveCount(count);
  const layout = await navigation.evaluate((element) => {
    const parent = element.parentElement!;
    const parentStyle = getComputedStyle(parent);
    const usableWidth = parent.getBoundingClientRect().width
      - parseFloat(parentStyle.paddingLeft)
      - parseFloat(parentStyle.paddingRight);
    const bounds = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll('button')].map((button) => button.getBoundingClientRect().width);
    return {
      remainingWidth: usableWidth - bounds.width,
      buttonWidthDifference: Math.max(...buttons) - Math.min(...buttons),
      viewportOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(Math.abs(layout.remainingWidth), 'The test picker should fill its available row').toBeLessThanOrEqual(3);
  expect(layout.buttonWidthDifference, 'All test options should receive the same width').toBeLessThanOrEqual(2);
  expect(layout.viewportOverflow, 'The test options must not cause horizontal scrolling').toBeLessThanOrEqual(0);
}

test('Biologie and Ma copie test selectors fill their row like scientific diagram protocols', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: 'Ma copie' }).click();

  const journeys = page.getByRole('group', { name: 'Parcours de test' });

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });

    await journeys.getByRole('button', { name: 'Schémas scientifiques' }).click();
    await expectFullWidthSubnavigation(page.getByRole('tablist', { name: 'Protocoles automatiques des schémas scientifiques' }),
      4,
    );

    await journeys.getByRole('button', { name: 'Biologie' }).click();
    const biology = page.getByRole('group', { name: 'Objectif du protocole de biologie' });
    await expectFullWidthSubnavigation(biology, 3);
    await biology.getByRole('button', { name: 'Vérifier la répétabilité' }).click();
    await expect(biology.getByRole('button', { name: 'Vérifier la répétabilité' }))
      .toHaveAttribute('aria-pressed', 'true');

    await journeys.getByRole('button', { name: 'Ma copie' }).click();
    const custom = page.getByRole('group', { name: 'Type d’évaluation' });
    await expectFullWidthSubnavigation(custom, 3);
    await custom.getByRole('button', { name: 'Analyse seule' }).click();
    await expect(custom.getByRole('button', { name: 'Analyse seule' }))
      .toHaveAttribute('aria-pressed', 'true');
  }
});
