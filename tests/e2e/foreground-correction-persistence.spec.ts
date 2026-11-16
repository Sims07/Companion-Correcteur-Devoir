import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

const pagePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=', 'base64',
);

test('individual correction retains every page after AI failure, refresh and retry without importing again', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'http://localhost:11434', apiCompatible: false,
      visionModel: 'vision:4b', analysisModel: 'analysis:4b',
    }));
  });
  let inferenceCalls = 0;
  await page.route('http://localhost:11434/**', async route => {
    const url = new URL(route.request().url());
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/api/tags') {
      return route.fulfill({ headers, json: { models: [
        { name: 'vision:4b' }, { name: 'analysis:4b' },
      ] } });
    }
    if (url.pathname === '/api/show') {
      return route.fulfill({ headers, json: { modelfile: 'FROM model' } });
    }
    if (url.pathname === '/api/chat') {
      if (route.request().postDataJSON()?.stream) {
        inferenceCalls++;
        return route.fulfill({ status: 503, headers, json: { error: 'AI_SERVER_TEST_FAILURE' } });
      }
      return route.fulfill({ headers, json: { message: { content: 'OK' } } });
    }
    return route.fulfill({ status: 404, headers, body: '{}' });
  });

  await page.goto('/');
  await openActiveAssignment(page);
  await page.locator('#copy-files').setInputFiles([
    { name: 'copie-page-1.png', mimeType: 'image/png', buffer: pagePng },
    { name: 'copie-page-2.png', mimeType: 'image/png', buffer: pagePng },
  ]);
  await expect(page.getByText('2 page(s) prête(s) à analyser')).toBeVisible();
  await expect(page.getByText('Copie sauvegardée sur cet appareil', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Corriger', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Corriger', exact: true }).click();
  await expect.poll(() => inferenceCalls).toBeGreaterThan(0);
  await expect(page.getByText(/AI_SERVER_TEST_FAILURE|HTTP 503/)).toBeVisible();

  // Browser is completely reloaded: this path previously erased a foreground
  // copy because it had never become a background job or archived correction.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
  await page.locator('.assignment-overview-card').first()
    .getByRole('button', { name: /Reprendre le devoir|Ouvrir le devoir/ }).click();
  const copy = page.locator('.copy-overview-grid .correction-series-card').filter({
    hasText: 'copie-page-1.png',
  });
  await expect(copy).toBeVisible();
  await expect(copy).toContainText('2 page');
  await copy.getByRole('button', { name: 'Reprendre la copie' }).click();
  await expect(page.locator('.copy-panel .file-list')).toContainText('copie-page-1.png');
  await expect(page.locator('.copy-panel .file-list')).toContainText('copie-page-2.png');
  await expect(page.getByText('Copie sauvegardée sur cet appareil', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Corriger', exact: true }).click();
  await expect.poll(() => inferenceCalls).toBeGreaterThanOrEqual(2);
});

test('foreground correction draft is stored separately for each assignment', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  await page.locator('#copy-files').setInputFiles({
    name: 'devoir-1.png', mimeType: 'image/png', buffer: pagePng,
  });
  await expect(page.getByText('Copie sauvegardée sur cet appareil', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  await page.getByRole('button', { name: /Créer un devoir/ }).click();
  await page.getByLabel('Nom du devoir').fill('Deuxième devoir indépendant');
  await page.getByRole('button', { name: /Créer et préparer le barème/ }).click();
  await expect(page.getByRole('heading', { name: 'Devoir et barème' })).toBeVisible();

  await page.reload();
  await expect(page.locator('.assignment-overview-card').filter({ hasText: 'Deuxième devoir indépendant' })).toBeVisible();
  const first = page.locator('.assignment-overview-card').filter({ hasNotText: 'Deuxième devoir indépendant' }).first();
  await first.getByRole('button', { name: /Reprendre le devoir|Ouvrir le devoir/ }).click();
  await expect(page.locator('.copy-overview-grid .correction-series-card').filter({ hasText: 'devoir-1.png' }))
    .toHaveCount(1);
});
