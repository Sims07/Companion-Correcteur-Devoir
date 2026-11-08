import { expect, test } from '@playwright/test';

test('an OpenAI-compatible configuration preloads a typed model without changing correction settings', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'https://ai.example/v1/chat/completions',
      apiCompatible: true, apiKey: 'models-token',
      visionModel: 'vision-stable', analysisModel: 'analysis-stable',
      correctionMethod: 'generative', criterionByCriterion: true,
    }));
  });
  const preloadRequests: { url: string; authorization: string | undefined }[] = [];
  await page.route('https://ai.example/v1/models/**', async (route) => {
    const request = route.request();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type' };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    preloadRequests.push({ url: request.url(), authorization: request.headers()['authorization'] });
    await route.fulfill({ status: 202, headers });
  });

  await page.goto('/');
  await page.locator('.assignment-overview-card').first().getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('button', { name: /Réglages de l’IA locale|IA locale à configurer/ }).click();

  const panel = page.locator('#teacher-ai-settings-panel');
  const name = panel.getByRole('textbox', { name: 'Nom du modèle à précharger' });
  await expect(name).toHaveValue('saluki-27b');
  await name.fill('qwen3.5:27b');
  await panel.getByRole('button', { name: 'Précharger ce modèle' }).click();
  await expect(panel.getByRole('status')).toContainText('Le serveur a confirmé le chargement de « qwen3.5:27b ».');
  expect(preloadRequests).toEqual([{ url: 'https://ai.example/v1/models/qwen3.5%3A27b/load', authorization: 'Bearer models-token' }]);
  await expect(panel.locator('#ollama-vision-model')).toHaveValue('vision-stable');
  await expect(panel.locator('#ollama-analysis-model')).toHaveValue('analysis-stable');
});
