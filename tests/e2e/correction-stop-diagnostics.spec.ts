import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=', 'base64',
);

test('a teacher can stop a running correction after navigating to the network inspector', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('companion-correcteur:auto-background-correction:v1', 'false');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'http://localhost:11434',
      apiCompatible: false,
      visionModel: 'vision:4b',
      analysisModel: 'analysis:4b',
    }));
  });

  let releaseModelRequest: (() => void) | undefined;
  const modelRequestHeld = new Promise<void>((resolve) => { releaseModelRequest = resolve; });
  let generationStarted = false;
  await page.route('http://localhost:11434/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/tags') {
      return route.fulfill({ headers, json: { models: [{ name: 'vision:4b' }, { name: 'analysis:4b' }] } });
    }
    if (path === '/api/show') return route.fulfill({ headers, json: { modelfile: 'FROM model' } });
    if (path === '/api/chat') {
      if (route.request().postDataJSON()?.stream) {
        generationStarted = true;
        await modelRequestHeld;
      }
      // After stop, the browser can already have cancelled the fetch.
      try {
        return await route.fulfill({ headers, json: { message: { content: 'Réponse tardive' } } });
      } catch { return; }
    }
    return route.fulfill({ status: 404, headers, body: '{}' });
  });

  try {
    await page.goto('/');
    await openActiveAssignment(page);
    await page.locator('#copy-files').setInputFiles({
      name: 'copie-stop.png', mimeType: 'image/png', buffer: image,
    });
    await expect(page.getByRole('button', { name: 'Corriger', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Corriger', exact: true }).click();
    await expect.poll(() => generationStarted).toBe(true);

    // The cancellation stays accessible even when the processing screen is unmounted.
    await expect(page.getByRole('button', { name: 'Arrêter les corrections en cours' })).toBeVisible();
    await page.getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('button', { name: 'Suivi & diagnostic' }).click();
    await page.getByRole('navigation', { name: 'Détails du suivi' })
      .getByRole('button', { name: 'Inspecteur réseau' }).click();
    const inspector = page.getByRole('region', { name: 'Inspecteur réseau' });
    const stop = inspector.getByRole('button', { name: 'Arrêter la correction en cours' });
    await expect(stop).toBeVisible();
    await stop.click();
    await expect(page.getByRole('button', { name: 'Arrêter les corrections en cours' })).toHaveCount(0);
    await expect(stop).toHaveCount(0);
  } finally {
    releaseModelRequest?.();
  }
});
