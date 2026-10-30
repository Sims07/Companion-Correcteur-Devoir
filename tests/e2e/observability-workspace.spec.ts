import { expect, test } from '@playwright/test';

test('opens the local observability workspace and explores a trace without exposing copy content', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('companion-correcteur:timing-history:v1', JSON.stringify([{
      id: 'trace-e2e-1',
      completedAt: '2026-10-30T08:00:00.000Z',
      visionModel: 'qwen3.5:4b',
      analysisModel: 'gemma3:4b',
      thinking: false,
      correctionMode: 'integrated',
      pageCount: 2,
      readingSeconds: 48,
      analysisSeconds: 92,
      totalSeconds: 140,
      outcome: 'success',
      modelScore: 14,
      criterionScores: [],
      assignmentId: 'assignment-e2e',
      assignmentTitle: 'Biologie cellulaire',
      diagnosticRuns: [
        { model: 'qwen3.5:4b', kind: 'vision', stage: 'reading', elapsedMs: 48000, promptTokens: 80, generatedTokens: 120, raw: 'TRANSCRIPTION PRIVÉE À NE PAS AFFICHER' },
        { model: 'gemma3:4b', kind: 'model', stage: 'analysis', elapsedMs: 92000, promptTokens: 220, generatedTokens: 180, raw: 'SORTIE PRIVÉE À NE PAS AFFICHER' },
      ],
    }]));
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Observabilité' }).click();

  await expect(page.getByRole('heading', { name: 'Observabilité' })).toBeVisible();
  await expect(page.getByText('Corrections analysées')).toBeVisible();
  await expect(page.locator('.observability-model-list').getByText('qwen3.5:4b')).toBeVisible();
  await expect(page.locator('.observability-model-list').getByText('gemma3:4b')).toBeVisible();
  await expect(page.getByText('TRANSCRIPTION PRIVÉE À NE PAS AFFICHER')).toHaveCount(0);
  await expect(page.getByText('SORTIE PRIVÉE À NE PAS AFFICHER')).toHaveCount(0);

  await page.locator('.observability-trace-details summary').first().click();
  await expect(page.getByRole('heading', { name: 'Étapes de cette trace' })).toBeVisible();
  await expect(page.getByText('Tokens non remontés')).toHaveCount(0);
  await expect(page.locator('.observability-privacy-note')).toContainText('ni image, ni transcription, ni sortie brute des modèles');
});
