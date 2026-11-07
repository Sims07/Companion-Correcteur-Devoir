import { expect, test } from '@playwright/test';

test('three bundled mitosis diagrams are visible and one click evaluates A/B/C without supplying expected scores to the model', async ({ page }) => {
  const configuration = {
    endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
    visionModel: '', analysisModel: 'd1:3b',
    transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
    transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
    transcriptionFrequencyPenalty: 0, analysisThinking: false,
    criterionByCriterion: true, correctionMethod: 'decision',
    secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
  };
  await page.addInitScript((profiles) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify(profiles));
  }, [{ id: 'd1-demo', name: 'D1 test image', mode: 'single', updatedAt: '2026-11-07T20:00:00Z', configuration }]);
  const systemOneRequests: Array<{ state: string; imageCount: number; questions: string[] }> = [];
  await page.route('http://localhost:11434/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'content-type': 'application/json',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (url.pathname === '/api/tags') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ models: [{ name: 'd1:3b', model: 'd1:3b' }] }) });
      return;
    }
    if (url.pathname === '/api/show') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ model_info: {} }) });
      return;
    }
    if (url.pathname === '/api/ps') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ models: [] }) });
      return;
    }
    if (url.pathname === '/v1/systemone') {
      const body = request.postDataJSON() as { state: string; images: string[]; questions: Record<string, unknown> };
      systemOneRequests.push({
        state: body.state, imageCount: body.images?.length ?? 0, questions: Object.keys(body.questions ?? {}),
      });
      const answers = Object.fromEntries(Object.keys(body.questions).map((key) => [
        key, key === 'alignment'
          ? { choice: 'aligned', probabilities: { aligned: 1 } }
          : { choice: 'absent', probabilities: { absent: 1 } },
      ]));
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ answers, usage: { input_tokens: 20, output_tokens: 0 } }) });
      return;
    }
    await route.fulfill({ status: 404, headers, body: '{}' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  const fixtures = panel.getByRole('region', { name: 'Schémas de référence intégrés' });
  await expect(fixtures.locator('.diagram-fixture-card')).toHaveCount(3);
  await expect(fixtures.getByText('10/10 attendu', { exact: true })).toBeVisible();
  await expect(fixtures.getByText('5/10 attendu', { exact: true })).toBeVisible();
  await expect(fixtures.getByText('0/10 attendu', { exact: true })).toBeVisible();
  await expect(fixtures.getByRole('combobox', { name: 'Passages par schéma' })).toHaveValue('1');
  await expect.poll(async () => fixtures.locator('img').evaluateAll((images) =>
    images.filter((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0).length),
  ).toBe(3);
  await expect(fixtures.getByRole('button', { name: 'Tester les 3 schémas en un clic' })).toBeDisabled();

  await page.getByRole('group', { name: 'Configurations à exécuter' })
    .locator('label.evaluation-profile-option').first().click();
  await fixtures.getByRole('button', { name: 'Tester les 3 schémas en un clic' }).click();

  const results = fixtures.getByRole('region', { name: 'Résultats des schémas A B C' });
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect(results.locator('tbody tr')).toHaveCount(3);
  // All 19 native image decisions remain measurable even if a resulting
  // provisional grade needs teacher review.
  await expect(results.getByText('19/19', { exact: true })).toHaveCount(3);
  await expect(results.getByText('10/10', { exact: true }).first()).toBeVisible();
  await expect(results.getByText('5/10', { exact: true }).first()).toBeVisible();
  await expect(results.getByText('0/10', { exact: true }).first()).toBeVisible();
  expect(systemOneRequests).toHaveLength(3);
  for (const req of systemOneRequests) {
    expect(req.imageCount).toBe(1);
    expect(req.questions.length).toBeGreaterThanOrEqual(19);
    expect(req.state).not.toContain('10/10');
    expect(req.state).not.toContain('5/10');
    expect(req.state).not.toContain('0/10');
  }

  // The 5-point picture can also be tested independently with the same one-click flow.
  await fixtures.getByRole('button', { name: 'Tester ce schéma' }).nth(1).click();
  await expect(results.locator('tbody tr')).toHaveCount(1);
  expect(systemOneRequests).toHaveLength(4);
});
