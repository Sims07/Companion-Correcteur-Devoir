import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('downloads a single analysis file for both radars, including older biology results', async ({ page }) => {
  await page.goto('/');
  const openRadars = () => page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openRadars();
  const downloadButton = page.getByRole('button', { name: 'Exporter tous les résultats' });
  await expect(downloadButton).toBeDisabled();
  await page.evaluate(() => localStorage.setItem('companion:biology-teacher-radar:v1', JSON.stringify(
    ['D1', 'Qwen'].map(model => ({
      id: model, model, profileId: model, profile: model, provider: 'ollama', method: 'decision',
      protocol: 'contract', caseId: 'D', recordedAt: '2026-11-12T12:00:00Z',
      status: 'failed', referenceScore: 0, score: null, decisions: [],
    }))
  )));
  await page.reload();
  if (!(await downloadButton.isVisible())) await openRadars();
  const downloading = page.waitForEvent('download');
  await downloadButton.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^companion-radars-.*\.json$/);
  const payload = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(payload.format).toBe('companion-radar-analysis');
  expect(payload.diagrams.campaigns).toEqual([]);
  expect(payload.biology.observations.map((item: { model: string }) => item.model)).toEqual(['D1', 'Qwen']);
});
