import { expect, test } from '@playwright/test';
import { openCustomTests } from './helpers/evaluation-models.ts';

async function openModelEditor(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  await page.getByRole('dialog', { name: 'Gérer les configurations IA' })
    .getByRole('button', { name: 'Modifier les réglages courants' }).click();
  return page.getByRole('dialog', { name: 'Créer ou modifier une configuration IA' });
}

test('configuration button calls Ollama /api/tags and shows the discovered models', async ({ page }) => {
  await page.goto('/');
  let calls = 0;
  await page.route('http://localhost:11434/api/tags', async (route) => {
    calls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
      models: [{ name: 'test-vision:4b' }, { name: 'test-decision:3b' }],
    }) });
  });
  const editor = await openModelEditor(page);
  await editor.getByRole('button', { name: 'Tester la connexion et détecter les modèles' }).click();
  await expect(editor.locator('.ds-status-notice--success')).toContainText('2 modèle(s) disponible(s)');
  await expect(editor.locator('#evaluation-analysis-model option')).toContainText(['Choisir un modèle', 'test-vision:4b', 'test-decision:3b']);
  expect(calls).toBe(1);
});

test('blocked browser connection is reported beside the button in the modal', async ({ page }) => {
  await page.goto('/');
  await page.route('http://localhost:11434/api/tags', route => route.abort('blockedbyclient'));
  const editor = await openModelEditor(page);
  await editor.getByRole('button', { name: 'Tester la connexion et détecter les modèles' }).click();
  await expect(editor.locator('.ds-status-notice--error')).toContainText('Impossible de joindre le serveur IA');
  await expect(editor.getByRole('button', { name: 'Tester la connexion et détecter les modèles' })).toBeEnabled();
});

test('teacher settings reports connection failure inline instead of a distant error banner', async ({ page }) => {
  await page.goto('/');
  await page.locator('.assignment-overview-card').first()
    .getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('button', { name: /Réglages IA|Configurer l’IA/ }).click();
  await page.route('http://localhost:11434/api/tags', route => route.abort('failed'));
  const panel = page.locator('#teacher-ai-settings-panel');
  await panel.getByRole('button', { name: 'Tester la connexion et détecter les modèles' }).click();
  await expect(panel.locator('.ds-status-notice--error')).toContainText('Impossible de joindre le serveur IA');
  await expect(panel.getByRole('button', { name: 'Tester la connexion et détecter les modèles' })).toBeEnabled();
});
