import { expect, test } from '@playwright/test';
import { openCustomTests } from './helpers/evaluation-models.ts';

test('compares streaming and JSON for a local profile and can stop a run after navigating', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
    endpoint: 'http://localhost:1234/v1/responses', apiCompatible: true, analysisModel: 'muse-glimmer',
  })));
  const requests: Array<{ stream: boolean; store: boolean; reasoning: { effort: string } }> = [];
  let release = () => {};
  await page.route('**/v1/responses', async route => {
    const body = route.request().postDataJSON();
    requests.push(body);
    if (requests.length > 2) {
      await new Promise<void>(resolve => { release = resolve; });
      return route.abort().catch(() => {});
    }
    if (!body.stream) return route.fulfill({ status: 422, body: 'Thinking non pris en charge' });
    return route.fulfill({ contentType: 'text/event-stream', body: [
      { type: 'response.output_text.delta', delta: '{"code":"COMPANION-42"}' },
      { type: 'response.completed', response: { output: [] } },
    ].map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('') });
  });

  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await nav.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  const diagrams = page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: 'Schémas scientifiques' });
  await diagrams.click();
  const panel = page.getByRole('region', { name: 'Compatibilité LM Studio Responses' });
  await panel.getByText('Comparer la compatibilité LM Studio Responses', { exact: true }).click();
  await panel.getByRole('checkbox', { name: 'Moyen' }).uncheck();
  const launch = panel.getByRole('button', { name: 'Lancer la comparaison Responses' });
  await launch.click();
  const table = panel.getByRole('table');
  await expect(panel.getByRole('status')).toContainText('Comparaison terminée · 2 essais');
  await expect(table.getByRole('row').filter({ hasText: 'Avec streaming' })).toContainText('Code attendu reçu');
  await expect(table.getByRole('row').filter({ hasText: 'Sans streaming' })).toContainText('422');
  expect(requests.map(({ stream, store, reasoning }) => [stream, store, reasoning.effort]))
    .toEqual([[true, false, 'none'], [false, false, 'none']]);

  const waiting = page.waitForRequest('**/v1/responses');
  await launch.click();
  await waiting;
  await expect(launch).toBeDisabled();
  await expect(panel.getByRole('status')).toContainText('Essai 1/2');
  await nav.getByRole('button', { name: 'Suivi & diagnostic' }).click();
  await nav.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await expect(panel.getByRole('status')).toContainText('Essai 1/2');
  await panel.getByRole('button', { name: 'Arrêter la comparaison' }).click();
  await openCustomTests(page);
  await diagrams.click();
  if (!await panel.getByRole('status').isVisible()) {
    await panel.getByText('Comparer la compatibilité LM Studio Responses', { exact: true }).click();
  }
  await expect(panel.getByRole('status')).toContainText('Comparaison arrêtée');
  release();
  expect(requests).toHaveLength(3);
});
