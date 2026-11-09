import { expect, test } from '@playwright/test';

const profilesKey = 'companion-correcteur:ollama-profiles:v1';

test('third method persists and sends diagram + all typed questions to Clef through exactly one native System One request', async ({ page }) => {
  const requests: Array<{ url: string; payload: Record<string, unknown> }> = [];
  await page.route('http://localhost:11434/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'POST,GET,OPTIONS', 'content-type': 'application/json' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/api/tags') return route.fulfill({ status: 200, headers, body: JSON.stringify({
      models: [{ name: 'clef-flash', model: 'clef-flash' }],
    }) });
    if (url.pathname === '/api/show') return route.fulfill({ status: 200, headers, body: JSON.stringify({ model_info: {} }) });
    if (url.pathname === '/api/ps') return route.fulfill({ status: 200, headers, body: JSON.stringify({ models: [] }) });
    if (url.pathname === '/v1/systemone') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      requests.push({ url: url.pathname, payload });
      const questions = payload.questions as Record<string, { type: string }>;
      const answers = Object.fromEntries(Object.keys(questions).map((key) => [
        key, { type: 'choice', choice: key === 'alignment' ? 'aligned' : 'present',
          confidence: 0.91, probabilities: { [key === 'alignment' ? 'aligned' : 'present']: 1 } },
      ]));
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ answers, usage: { input_tokens: 42, output_tokens: 0 } }) });
    }
    requests.push({ url: url.pathname, payload: {} });
    return route.fulfill({ status: 404, headers, body: '{}' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.locator('#evaluation-profile-name').fill('Clef Vision + Décision');
  await page.locator('#evaluation-decision-model').fill('clef-flash');
  await page.locator('#evaluation-correction-method').selectOption('decision');
  await page.getByText('Options de décision sur image', { exact: true }).click();
  await page.getByLabel('Envoyer directement les images au décisionnel').check();
  await expect(page.locator('#evaluation-criterion-by-criterion')).toBeDisabled();
  await page.getByRole('button', { name: 'Enregistrer la configuration' }).click();
  const saved = await page.evaluate((key) => {
    const savedProfiles = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
      id: string; name: string; configuration: { correctionMethod: string; visionModel: string };
    }>;
    return savedProfiles.find((profile) => profile.name === 'Clef Vision + Décision');
  }, profilesKey);
  expect(saved).toMatchObject({ configuration: { correctionMethod: 'visual-decision', visionModel: '' } });

  await page.getByRole('group', { name: 'Configurations à exécuter' })
    .getByText('Clef Vision + Décision').click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();
  const fixtures = page.getByRole('region', { name: 'Schémas de référence intégrés' });
  await fixtures.getByRole('button', { name: 'Tester ce schéma' }).first().click();
  const results = fixtures.getByRole('region', { name: 'Résultats des schémas scientifiques' });
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect(results.locator('tbody tr')).toHaveCount(1);
  await expect(results.getByText('19/19', { exact: true })).toBeVisible();
  expect(requests.filter((request) => request.url === '/v1/systemone')).toHaveLength(1);
  expect(requests.filter((request) => request.url === '/api/chat')).toHaveLength(0);
  const body = requests.find((request) => request.url === '/v1/systemone')!.payload;
  expect(body.model).toBe('clef-flash');
  expect(body.images).toHaveLength(1);
  expect(Object.keys(body.questions as Record<string, unknown>).length).toBeGreaterThanOrEqual(19);

  await page.reload();
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.getByText('Créer ou modifier une configuration IA', { exact: true }).click();
  await page.locator('#evaluation-profile-select').selectOption(saved!.id);
  await expect(page.locator('#evaluation-correction-method')).toHaveValue('decision');
  await page.getByText('Options de décision sur image', { exact: true }).click();
  await expect(page.getByLabel('Envoyer directement les images au décisionnel')).toBeChecked();
});

test('TEV1 configured as direct image decision is blocked visibly before running the scientific diagram benchmark', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.locator('#evaluation-profile-name').fill('TEV1 visual incompatible');
  await page.locator('#evaluation-decision-model').fill('tev1:4b');
  await page.locator('#evaluation-correction-method').selectOption('decision');
  await page.getByText('Options de décision sur image', { exact: true }).click();
  await page.getByLabel('Envoyer directement les images au décisionnel').check();
  await page.getByRole('button', { name: 'Enregistrer la configuration' }).click();
  await page.getByRole('group', { name: 'Configurations à exécuter' })
    .getByText('TEV1 visual incompatible').click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();
  const fixtures = page.getByRole('region', { name: 'Schémas de référence intégrés' });
  await expect(fixtures.getByText(/TEV1 ne prend pas en charge les images via System One/).first()).toBeVisible();
  await expect(fixtures.getByRole('button', { name: 'Tester les 3 schémas en un clic' })).toBeDisabled();
});
