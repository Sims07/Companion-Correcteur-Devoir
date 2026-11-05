import { expect, test } from '@playwright/test';

test('failed AI execution leads to its trace and separately to filtered network errors', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('companion-correcteur:timing-history:v1', JSON.stringify([{
      id: 'failed-grade-e2e',
      completedAt: '2026-11-04T08:00:00.000Z',
      visionModel: 'vision-test',
      analysisModel: 'analysis-test',
      pageCount: 1,
      readingSeconds: 10,
      analysisSeconds: 4,
      totalSeconds: 14,
      outcome: 'error',
      modelScore: null,
      criterionScores: [],
      assignmentTitle: 'Barème de dépannage',
      diagnosticRuns: [{
        model: 'analysis-test', kind: 'model', stage: 'analysis',
        elapsedMs: 4000, error: 'Réponse du modèle non exploitable',
        raw: 'JSON invalide',
      }],
    }]));
    localStorage.setItem('companion-correcteur:network-inspector:v1', JSON.stringify([{
      id: 'error-http-e2e',
      method: 'POST', url: 'http://localhost:11434/api/chat',
      intent: 'Notation du barème', context: 'Modèle analysis-test',
      startedAt: '2026-11-04T08:00:01.000Z',
      durationMs: 500, state: 'error', status: 422, statusText: 'Unprocessable Content',
      requestHeaders: {}, responseHeaders: {},
      requestBody: '{}', responseBody: '{}', error: 'HTTP 422',
    }, {
      id: 'success-http-e2e',
      method: 'GET', url: 'http://localhost:11434/api/tags',
      intent: 'Vérifier les modèles', context: '',
      startedAt: '2026-11-04T08:00:00.000Z',
      durationMs: 30, state: 'success', status: 200, statusText: 'OK',
      requestHeaders: {}, responseHeaders: {},
      requestBody: '', responseBody: '', error: null,
    }]));
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  const incidents = page.getByRole('region', { name: 'Incidents à examiner' });
  await expect(incidents.getByText('Barème de dépannage')).toBeVisible();
  await expect(incidents.getByText(/analysis-test/)).toBeVisible();
  await incidents.getByRole('button', { name: 'Examiner la trace' }).click();
  const trace = page.locator('#observability-trace-failed-grade-e2e');
  await expect(trace).toHaveAttribute('open', '');
  await expect(trace.getByText('Réponse du modèle non exploitable')).toBeHidden();
  await trace.locator('.observability-call-details summary').click();
  await expect(trace.getByText('Réponse du modèle non exploitable')).toBeVisible();

  await incidents.getByRole('button', { name: 'Voir les erreurs réseau' }).click();
  const filters = page.getByRole('group', { name: 'Filtrer par statut' });
  await expect(filters.getByRole('button', { name: 'Erreurs' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.network-request-row')).toHaveCount(1);
  await expect(page.locator('.network-request-row')).toContainText('422');
  await page.getByRole('navigation', { name: 'Navigation des outils IA' }).getByRole('button', { name: /Observabilité/ }).click();
  await page.getByRole('navigation', { name: 'Navigation des outils IA' }).getByRole('button', { name: /Inspecteur réseau/ }).click();
  await expect(filters.getByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.network-request-row')).toHaveCount(2);
});
