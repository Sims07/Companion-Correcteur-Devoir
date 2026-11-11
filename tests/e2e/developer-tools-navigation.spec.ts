import { expect, test } from '@playwright/test';

test('application offers evaluation and diagnostics as top-level destinations', async ({ page }) => {
  await page.goto('/');

  const primaryNavigation = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(primaryNavigation.getByRole('button')).toHaveCount(3);
  await expect(primaryNavigation.getByRole('button', { name: 'Correction' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Navigation des outils IA' })).toHaveCount(0);

  await primaryNavigation.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await expect(primaryNavigation.getByRole('button', { name: 'Évaluer les modèles' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Détails du suivi' })).toHaveCount(0);
  await expect(page.locator('.developer-tools')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Évaluer les modèles' })).toHaveCount(1);
  await expect(page.getByRole('group', { name: 'Type d’évaluation' })).toBeVisible();
  await expect(page.locator('.developer-tools-heading, .developer-tools-nav')).toHaveCount(0);

  await primaryNavigation.getByRole('button', { name: 'Suivi & diagnostic' }).click();
  await expect(primaryNavigation.getByRole('button', { name: 'Suivi & diagnostic' })).toHaveAttribute('aria-current', 'page');
  const details = page.getByRole('navigation', { name: 'Détails du suivi' });
  await expect(details.getByRole('button')).toHaveCount(2);
  await expect(details.getByRole('button', { name: 'Suivi des corrections' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.developer-tools-support')).not.toHaveAttribute('open', '');
  await expect(page.getByRole('heading', { name: 'Observabilité' })).toBeVisible();

  await details.getByRole('button', { name: 'Inspecteur réseau' }).click();
  await expect(details.getByRole('button', { name: 'Inspecteur réseau' })).toHaveAttribute('aria-pressed', 'true');
  await expect(primaryNavigation.getByRole('button', { name: 'Suivi & diagnostic' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Inspecteur réseau' })).toBeVisible();

  await primaryNavigation.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await expect(page.getByRole('navigation', { name: 'Détails du suivi' })).toHaveCount(0);
  await primaryNavigation.getByRole('button', { name: 'Correction' }).click();
  await expect(primaryNavigation.getByRole('button', { name: 'Correction' })).toHaveAttribute('aria-current', 'page');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(primaryNavigation.getByRole('button')).toHaveCount(3);
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('support diagnostic can be copied without sharing copy contents or configured endpoint URLs', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (report: string) => {
        (window as Window & { __copiedSupportReport?: string }).__copiedSupportReport = report;
      } },
    });
    localStorage.setItem('companion-correcteur:timing-history:v1', JSON.stringify([{
      id: 'copy-test',
      completedAt: '2026-11-05T06:00:00.000Z',
      visionModel: 'qwen3.5:4b',
      analysisModel: 'qwen3.5:4b',
      pageCount: 1, readingSeconds: 10, analysisSeconds: 5, totalSeconds: 15,
      outcome: 'error', modelScore: null, criterionScores: [],
      assignmentTitle: 'PRIVATE-STUDENT-COPY-SECRET',
      diagnosticRuns: [{ model: 'qwen3.5:4b', stage: 'analysis', kind: 'model', elapsedMs: 5000,
        error: 'RAW-ERROR-SECRET', raw: 'RAW-RESPONSE-SECRET', requestPrompt: 'PROMPT-SECRET',
        requestMetadata: { endpoint: 'https://PRIVATE-URL-SECRET.example', stream: true, think: false,
          imageCount: 1, keepAlive: 0, options: { contextTokens: 100, generationTokenLimit: 100 } },
      }],
    }]));
  });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Suivi & diagnostic' }).click();
  await page.getByText('Aide au diagnostic et partage avec le support').click();
  await page.getByRole('button', { name: 'Copier un diagnostic technique' }).click();
  await expect(page.getByRole('status').getByText(/Diagnostic technique copié/)).toBeVisible();
  const report = await page.evaluate(() => (window as Window & { __copiedSupportReport?: string }).__copiedSupportReport ?? '');
  expect(report).toContain('diagnostic technique');
  expect(report).toContain('modèle qwen3.5:4b');
  expect(report).not.toContain('SECRET');
  expect(report).not.toContain('PRIVATE');
  expect(report).not.toContain('PROMPT');
  expect(report).not.toContain('https://');
});


test('the network inspector keeps six aligned columns on desktop and prioritizes intent on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Suivi & diagnostic' }).click();
  await page.getByRole('navigation', { name: 'Détails du suivi' }).getByRole('button', { name: 'Inspecteur réseau' }).click();
  const headings = page.locator('.network-request-columns');
  await expect(headings.locator('span')).toHaveCount(6);
  const desktopColumns = await headings.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);
  expect(desktopColumns).toBe(6);
  await expect(page.locator('.network-request-list')).toHaveCSS('background-color', 'rgb(255, 253, 249)');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(headings.locator('span').nth(2)).toBeHidden();
  await expect(headings.locator('span').nth(3)).toBeVisible();
  const viewport = await page.evaluate(() => document.documentElement.clientWidth);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(viewport);
});
