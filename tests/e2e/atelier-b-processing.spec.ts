import { expect, test } from '@playwright/test';

test('correction en cours : le vrai composant React respecte la maquette B', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.addStyleTag({ content: '#root { display: none !important; }' });

  // Mount the actual application component through Vite, not hand-written markup.
  // The fixture uses a fully synthetic biology copy and never contacts a model.
  await page.evaluate(async () => {
    const entryUrl = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))
      .map((script) => script.src)
      .find((url) => url.includes('/src/main.tsx')) ?? '';
    const basePath = entryUrl ? new URL(entryUrl).pathname.split('/src/main.tsx')[0] : '';
    // CI serves the Vite application under /Companion-Correcteur-Devoir/;
    // absolute /tests/... URLs would otherwise return the wrong resource.
    const modulePath = basePath + '/tests/e2e/fixtures/activeCorrectionVisualFixture.tsx';
    const response = await fetch(modulePath);
    if (!response.ok) throw new Error('Fixture unavailable: ' + response.status + ' at ' + modulePath);
    const fixtureModule = await import(/* @vite-ignore */ modulePath);
    fixtureModule.mountActiveCorrectionVisualFixture();
  });

  const surface = page.locator('.atelier-processing-test-fixture');
  const left = surface.locator('.atelier-processing-source');
  const right = surface.locator('.background-copy-activity');
  await expect(surface.getByRole('heading', { name: 'Correction en cours' })).toBeVisible();
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await expect(surface.getByRole('status')).toContainText('Correction des réponses');
  await expect(surface.locator('.background-copy-activity-criteria li.is-active')).toContainText('Titre');
  await expect(surface.getByRole('progressbar', { name: 'Critères du barème traités' })).toHaveAttribute('aria-valuenow', '1');

  await expect(left).toHaveCSS('border-radius', '3px');
  await expect(right).toHaveCSS('border-radius', '3px');
  await expect(surface.locator('.background-copy-activity-criteria li').first()).toHaveCSS('border-radius', '0px');
  const progress = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.background = 'var(--ds-color-progress)';
    probe.style.color = 'var(--ds-color-progress-surface)';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const color = style.backgroundColor;
    const surface = style.color;
    probe.remove();
    return { color, surface };
  });
  await expect(surface.locator('.atelier-processing-phases .is-current')).toHaveCSS('border-bottom-color', progress.color);
  await expect(surface.locator('.atelier-processing-phases .is-current .atelier-processing-phase-number')).toHaveCSS('background-color', progress.color);
  await expect(surface.locator('.atelier-processing-current')).toHaveCSS('background-color', progress.surface);
  await expect(surface.locator('.background-copy-activity-criteria li.is-active .background-copy-activity-marker')).toHaveCSS('background-color', progress.color);
  await expect(surface.locator('.analysis-progress.teacher-progress-card.background-copy-progress')).toHaveCount(0);

  const leftBox = await left.boundingBox();
  const rightBox = await right.boundingBox();
  const imageBox = await surface.locator('.atelier-processing-page img').boundingBox();
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  expect(imageBox).not.toBeNull();
  expect(leftBox!.x + leftBox!.width).toBeLessThanOrEqual(rightBox!.x);
  expect(leftBox!.width / rightBox!.width).toBeGreaterThan(0.8);
  expect(leftBox!.width / rightBox!.width).toBeLessThan(1.3);
  expect(imageBox!.height).toBeGreaterThanOrEqual(450);
  await page.screenshot({ path: testInfo.outputPath('atelier-b-processing-desktop.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLeft = await left.boundingBox();
  const mobileRight = await right.boundingBox();
  expect(mobileLeft).not.toBeNull();
  expect(mobileRight).not.toBeNull();
  expect(mobileRight!.y).toBeGreaterThan(mobileLeft!.y);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('atelier-b-processing-mobile.png'), fullPage: true, animations: 'disabled' });
});
