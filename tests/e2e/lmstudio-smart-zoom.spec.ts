import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';
import { openCustomTests } from './helpers/evaluation-models';

const key = 'companion-correcteur:ollama-configuration:v1';

test('teacher enables local smart zoom and the configuration survives reload', async ({ page }) => {
  await page.addInitScript(key => {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({
      endpoint: 'http://localhost:1234/api/v1/chat', apiCompatible: true,
      visionModel: 'gemma', analysisModel: 'gemma', generativeModel: 'gemma',
      correctionMethod: 'generative', criterionByCriterion: true, smartZoom: false,
    }));
  }, key);
  await page.goto('/');
  await openActiveAssignment(page);
  await page.getByRole('button', { name: /Réglages IA|Configurer l’IA/ }).click();
  const panel = page.locator('#teacher-ai-settings-panel');
  const toggle = panel.getByRole('checkbox', { name: /Zoom intelligent sur demande/ });
  await expect(toggle).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').smartZoom, key)).toBe(true);
  await page.reload();
  await openActiveAssignment(page);
  await page.getByRole('button', { name: /Réglages IA|Configurer l’IA/ }).click();
  await expect(page.locator('#teacher-ai-settings-panel')
    .getByRole('checkbox', { name: /Zoom intelligent sur demande/ })).toBeChecked();
});

test('laboratory editor offers the same opt-in only on native LM Studio', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  await page.getByRole('dialog', { name: 'Gérer les configurations IA' })
    .getByRole('button', { name: 'Modifier les réglages courants' }).click();
  const dialog = page.getByRole('dialog', { name: 'Créer ou modifier une configuration IA' });
  await dialog.getByLabel('Fournisseur IA').selectOption('openai');
  await expect(dialog.getByRole('checkbox', { name: /Zoom intelligent sur demande/ })).toHaveCount(0);
  await dialog.getByLabel('URL de l’API IA').fill('http://localhost:1234/api/v1/chat');
  const toggle = dialog.getByRole('checkbox', { name: /Zoom intelligent sur demande/ });
  await expect(toggle).toBeVisible();
  await toggle.check();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').smartZoom, key)).toBe(true);
});
