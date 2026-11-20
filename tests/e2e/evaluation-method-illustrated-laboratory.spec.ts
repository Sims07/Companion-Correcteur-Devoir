import { expect, test } from '@playwright/test';

test('method laboratory displays a full-width illustrated panel for every strategy on desktop and mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const navigation = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await navigation.getByRole('button', { name: 'Radars' }).click();

  const home = page.getByRole('region', { name: 'Tableau de bord des radars' });
  await home.getByRole('article', { name: 'Schémas scientifiques' })
    .getByRole('button', { name: 'Analyse des méthodes' }).click();

  const lab = page.getByRole('region', { name: 'Laboratoire des méthodes' });
  const tabs = lab.getByRole('tablist', { name: 'Méthodes expliquées' }).getByRole('tab');
  const panel = lab.getByRole('tabpanel');
  await expect(tabs).toHaveCount(10);
  await expect(panel).toHaveAttribute('data-selected-method', 'image-direct-v1');
  await expect(panel.getByRole('img', { name: /Schéma scientifique et barème fournis directement/ })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Principe scientifique' })).toBeVisible();

  await lab.locator('[data-method-id="pixel-v1"]').click();
  await expect(panel).toHaveAttribute('data-selected-method', 'pixel-v1');
  await expect(panel.locator('[data-illustration="small-tips"]')).toBeVisible();
  await lab.locator('[data-method-id="leaders-v1"]').click();
  await expect(panel.locator('[data-illustration="long-shafts"]')).toBeVisible();
  await lab.locator('[data-method-id="direct-v1"]').click();
  await expect(panel.locator('[data-illustration="direct-graph"]')).toBeVisible();
  await lab.locator('[data-method-id="guided-v1"]').click();
  await expect(panel.locator('[data-illustration="guided"]')).toBeVisible();
  await lab.locator('[data-method-id="graph-first-v1"]').click();
  await expect(panel.locator('[data-illustration="graph-first"]')).toBeVisible();
  await lab.locator('[data-method-id="graph-first-v2"]').click();
  await expect(panel.locator('[data-illustration="relations-v2"]')).toBeVisible();
  await lab.locator('[data-method-id="vision-then-analysis"]').click();
  await expect(panel).toHaveAttribute('data-selected-method', 'vision-then-analysis');
  await expect(panel.locator('[data-illustration="vision-analysis"]')).toBeVisible();
  await lab.locator('[data-method-id="direct-image-generative-thinking"]').click();
  await expect(panel.locator('[data-illustration="thinking-grading"]')).toBeVisible();
  await lab.locator('[data-method-id="direct-image-systemone"]').click();
  await expect(panel.locator('[data-illustration="systemone-grading"]')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeVisible();
  const mobileLayout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    overflowingElements: [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(element => element.getBoundingClientRect().right > window.innerWidth + 1 &&
        element.getBoundingClientRect().width > 0)
      .slice(0, 15).map(element => ({
        tag: element.tagName, className: typeof element.className === 'string' ? element.className : '',
        width: Math.round(element.getBoundingClientRect().width),
        right: Math.round(element.getBoundingClientRect().right),
      })),
  }));
  expect(mobileLayout.scroll, JSON.stringify(mobileLayout)).toBeLessThanOrEqual(mobileLayout.viewport);
  const auditDimensions = await lab.locator('.radar-method-audit-scroll').evaluate(element => ({
    viewport: element.clientWidth, table: element.scrollWidth,
  }));
  expect(auditDimensions.table).toBeGreaterThan(auditDimensions.viewport);

  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(panel).toHaveAttribute('data-selected-method', 'direct-v1');

  // Reclassification must be visible immediately and survive a page reload.
  await lab.locator('[data-method-id="pixel-v1"]').click();
  await panel.getByLabel('Classement').selectOption('candidate');
  await expect(lab.locator('[data-status-group="candidate"] [data-method-id="pixel-v1"]')).toBeVisible();
  await expect(panel.getByRole('status')).toContainText('enregistré');
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Radars' }).click();
  await page.getByRole('region', { name: 'Tableau de bord des radars' })
    .getByRole('article', { name: 'Schémas scientifiques' }).getByRole('button', { name: 'Analyse des méthodes' }).click();
  await expect(page.getByRole('region', { name: 'Laboratoire des méthodes' })
    .locator('[data-status-group="candidate"] [data-method-id="pixel-v1"]')).toBeVisible();

  await lab.getByRole('button', { name: 'Retour aux radars' }).click();
  // The mobile dashboard presents its articles as display:contents. Navigate
  // back on desktop to test the separate biology laboratory, not dashboard semantics.
  await page.setViewportSize({ width: 1280, height: 900 });
  await home.getByRole('article', { name: 'Biologie' })
    .getByRole('button', { name: 'Analyse des méthodes' }).click();
  const biologyLab = page.getByRole('region', { name: 'Laboratoire des méthodes' });
  const biologyTabs = biologyLab.getByRole('tablist', { name: 'Méthodes expliquées' }).getByRole('tab');
  await expect(biologyTabs).toHaveCount(3);
  await biologyTabs.nth(1).click();
  await expect(biologyLab.getByRole('tabpanel').locator('[data-illustration="standard-rubric"]')).toBeVisible();
  await biologyTabs.nth(2).click();
  await expect(biologyLab.getByRole('tabpanel').locator('[data-illustration="historical-pilot"]')).toBeVisible();
});
