import { expect, test } from '@playwright/test';

test('Correction, Évaluer and Suivi & diagnostic use the same full-width page frame on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 980 });
  await page.goto('/');

  const correction = await page.locator('main.teacher-flow-shell').boundingBox();
  const teacherHeader = await page.locator('main.teacher-flow-shell > .topbar').boundingBox();
  expect(correction?.width).toBeGreaterThanOrEqual(1679);
  expect(teacherHeader?.width).toBeGreaterThanOrEqual(1679);

  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();

  const evalShell = page.locator('main.evaluation-workspace-shell');
  await expect(evalShell).toHaveCSS('max-width', 'none');
  const evalBox = await evalShell.boundingBox();
  const evalHeader = await evalShell.locator(':scope > .topbar').boundingBox();
  const evalContent = await page.locator('.evaluation-step-nav').boundingBox();
  expect(evalBox?.width).toBeGreaterThanOrEqual(1679);
  expect(evalHeader?.width).toBeGreaterThanOrEqual(1679);
  expect(evalContent?.width).toBeGreaterThan(1590);
  expect(evalContent?.x).toBeGreaterThanOrEqual(20);

  await page.getByRole('button', { name: 'Suivi & diagnostic' }).click();
  const monitorShell = page.locator('main.ai-tools-view');
  await expect(monitorShell).toHaveCSS('max-width', 'none');
  const monitorBox = await monitorShell.boundingBox();
  const monitorHeader = await monitorShell.locator(':scope > .topbar').boundingBox();
  const observability = await page.locator('.observability-workspace').boundingBox();
  expect(monitorBox?.width).toBeGreaterThanOrEqual(1679);
  expect(monitorHeader?.width).toBeGreaterThanOrEqual(1679);
  expect(observability?.width).toBeGreaterThan(1590);
  expect(observability?.x).toBeGreaterThanOrEqual(20);

  await page.getByRole('button', { name: 'Inspecteur réseau' }).click();
  const inspector = await page.locator('.network-inspector').boundingBox();
  expect(inspector?.width).toBeGreaterThan(1590);
});

test('Évaluer and Suivi keep an accessible gutter without horizontal scrolling on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();

  const evaluation = page.locator('main.evaluation-workspace-shell');
  await expect(evaluation).toHaveCSS('max-width', 'none');
  const evalHeader = await evaluation.locator(':scope > .topbar').boundingBox();
  const content = await page.locator('.evaluation-step-nav').boundingBox();
  expect(evalHeader?.width).toBeGreaterThanOrEqual(389);
  expect(content?.x).toBeGreaterThanOrEqual(15);
  expect(content?.width).toBeLessThan(390);

  await page.getByRole('button', { name: 'Suivi & diagnostic' }).click();
  const header = await page.locator('main.ai-tools-view > .topbar').boundingBox();
  const monitor = await page.locator('.observability-workspace').boundingBox();
  expect(header?.width).toBeGreaterThanOrEqual(389);
  expect(monitor?.x).toBeGreaterThanOrEqual(15);
  expect(monitor?.width).toBeLessThan(390);
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
