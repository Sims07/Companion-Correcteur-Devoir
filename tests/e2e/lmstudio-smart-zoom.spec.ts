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

test('laboratory displays the same crop that is delivered to the model', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({
    endpoint: 'http://localhost:1234/api/v1/chat', apiCompatible: true,
    analysisModel: 'gemma', generativeModel: 'gemma', correctionMethod: 'generative',
  })), key);
  let sentCrop = '';
  await page.route('**/v1/responses', async route => {
    const body = route.request().postDataJSON();
    if (body.previous_response_id) sentCrop = body.input[1].content[1].image_url;
    await route.fulfill({ json: body.previous_response_id
      ? { id: 'resp_end', output: [], output_text: '0000' }
      : { id: 'resp_start', output: [{ type: 'function_call', name: 'inspect_region', call_id: 'one',
          arguments: JSON.stringify({ page: 1, x: 0.64, y: 0.46, width: 0.12, height: 0.08 }) }] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: 'Schémas scientifiques' }).click();
  await page.getByText('Vérifier le zoom du modèle', { exact: true }).click();
  await page.getByRole('button', { name: 'Tester le cadrage' }).click();
  await expect(page.getByText(/1 zoom\(s\) obtenu/)).toBeVisible();
  await expect(page.getByText(/cible couverte à 100 %/)).toBeVisible();
  expect(sentCrop).toMatch(/^data:image\/png;base64,/);
  await expect(page.getByAltText('Recadrage réel 1')).toHaveAttribute('src', sentCrop);
});
