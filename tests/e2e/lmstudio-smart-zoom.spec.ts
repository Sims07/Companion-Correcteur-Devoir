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
  await panel.getByLabel('Zooms maximum par critère').selectOption('8');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').smartZoomBudget, key)).toBe(8);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').smartZoom, key)).toBe(true);
  await page.reload();
  await openActiveAssignment(page);
  await page.getByRole('button', { name: /Réglages IA|Configurer l’IA/ }).click();
  await expect(page.locator('#teacher-ai-settings-panel').getByLabel('Zooms maximum par critère')).toHaveValue('8');
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
  await dialog.getByLabel('Connexion IA').selectOption('openai');
  await expect(dialog.getByRole('checkbox', { name: /Zoom intelligent sur demande/ })).toHaveCount(0);
  await dialog.getByLabel('URL de l’API IA').fill('http://localhost:1234/api/v1/chat');
  const toggle = dialog.getByRole('checkbox', { name: /Zoom intelligent sur demande/ });
  await expect(toggle).toBeVisible();
  await dialog.getByText('Options de connexion', { exact: true }).click();
  await dialog.getByLabel('API des schémas').selectOption('lmstudio-responses');
  await expect(dialog.getByLabel('Raisonnement')).toHaveValue('default');
  await expect(dialog.getByLabel('URL de l’API IA')).toHaveValue('http://localhost:1234/v1/responses');
  await expect(toggle).toBeVisible();
  await toggle.check();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').smartZoom, key)).toBe(true);
});

test('laboratory displays the same crop that is delivered to the model', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({
    endpoint: 'http://localhost:1234/v1/chat/completions', apiCompatible: true,
    analysisModel: 'gemma', generativeModel: 'gemma', correctionMethod: 'generative',
  })), key);
  let sentCrop = '';
  let mode: 'zoom' | 'no-call' | 'truncated' | 'reasoning' | 'error' | 'wait' = 'zoom';
  let release = () => {};
  await page.route('**/v1/responses', async route => {
    if (mode === 'error') return route.fulfill({ status: 503, body: 'indisponible' });
    if (mode === 'wait') {
      await new Promise<void>(resolve => { release = resolve; });
      return route.abort().catch(() => {});
    }
    if (mode === 'truncated') return route.fulfill({ json: {
      id: 'resp_truncated', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
      output: [{ type: 'message', content: [{ type: 'output_text', text: '02' }] }],
    } });
    if (mode === 'reasoning') return route.fulfill({ json: {
      id: 'resp_reasoning', status: 'completed',
      output: [{ type: 'reasoning', summary: [{ type: 'summary_text', text: '0283' }] }],
    } });
    if (mode === 'no-call') return route.fulfill({ json: { id: 'resp_skip', output: [], output_text: '0283' } });
    const body = route.request().postDataJSON();
    expect(body.stream).toBe(true);
    if (body.previous_response_id) sentCrop = body.input[1].content[1].image_url;
    const result = body.previous_response_id
      ? { id: 'resp_end', output: [] }
      : { id: 'resp_start', output: [{ type: 'function_call', name: 'inspect_region', call_id: 'one',
          arguments: JSON.stringify({ page: 1, x: 0.64, y: 0.46, width: 0.12, height: 0.08 }) }] };
    const fragment = body.previous_response_id
      ? 'data: ' + JSON.stringify({ type: 'response.output_text.done', text: '0000' }) + '\n\n' : '';
    await route.fulfill({ contentType: 'text/event-stream', body: fragment + 'data: ' +
      JSON.stringify({ type: 'response.completed', response: result }) + '\n\n' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: 'Schémas scientifiques' }).click();
  await page.getByText('Vérifier le zoom du modèle', { exact: true }).click();
  await page.getByLabel('Budget de zoom du test').selectOption('4');
  await page.getByRole('button', { name: 'Tester le cadrage' }).click();
  await expect(page.getByRole('table', { name: 'Comparaison des budgets de zoom' }).getByText('1/4')).toBeVisible();
  await expect(page.getByText(/1 zoom\(s\) obtenu/)).toBeVisible();
  await expect(page.getByText(/Réponse du modèle : 0000/)).toBeVisible();
  await expect(page.getByText(/cible couverte à 100 %/)).toBeVisible();
  expect(sentCrop).toMatch(/^data:image\/png;base64,/);
  await expect(page.getByAltText('Recadrage réel 1')).toHaveAttribute('src', sentCrop);
  const launch = page.getByRole('button', { name: 'Tester le cadrage' });
  mode = 'no-call';
  await page.getByLabel('Budget de zoom du test').selectOption('2');
  await launch.click();
  await expect(page.getByRole('table', { name: 'Comparaison des budgets de zoom' }).getByText('0/2')).toBeVisible();
  await expect(page.getByRole('table', { name: 'Comparaison des budgets de zoom' }).getByText('1/4')).toBeVisible();
  await expect(page.getByText(/Aucun appel de zoom/)).toBeVisible();
  await expect(page.getByAltText('Recadrage réel 1')).toHaveCount(0);
  mode = 'truncated';
  await launch.click();
  await expect(page.getByText('Limite de génération atteinte pendant le test de zoom.')).toBeVisible();
  mode = 'reasoning';
  await launch.click();
  await expect(page.getByText('LM Studio Responses n’a renvoyé aucune réponse finale pour le test de zoom.')).toBeVisible();
  mode = 'error';
  await launch.click();
  await expect(page.getByText(/LM Studio a répondu HTTP 503/)).toBeVisible();
  mode = 'wait';
  const pending = page.waitForRequest('**/v1/responses');
  await launch.click();
  await pending;
  await expect(launch).toBeDisabled();
  const journeys = page.getByRole('group', { name: 'Parcours de test' });
  await journeys.getByRole('button', { name: 'Ma copie' }).click();
  await journeys.getByRole('button', { name: 'Schémas scientifiques' }).click();
  await page.getByRole('button', { name: 'Arrêter le test' }).click();
  release();
  await expect(page.getByText('Essai arrêté')).toBeVisible();
  await expect(launch).toBeEnabled();
});
