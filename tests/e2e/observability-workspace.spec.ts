import { expect, test } from '@playwright/test';

test('opens the observability workspace and explores a trace without exposing copy content', async ({ page }) => {
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
        { model: 'qwen3.5:4b', kind: 'vision', stage: 'reading', purpose: 'scientific-diagram-analysis', elapsedMs: 48000, promptTokens: 80, generatedTokens: 120, requestPayload: JSON.stringify({ attempts: [{ messages: [{ role: 'system', content: 'SYSTEM PROMPT VISION ENVOYÉ' }, { role: 'user', content: 'USER PROMPT VISION ENVOYÉ' }] }] }), requestMetadata: { stream: true, think: false, imageCount: 1, keepAlive: 0, options: { contextTokens: 4096, generationTokenLimit: 2048 } }, raw: 'RÉPONSE VISION BRUTE' },
        { model: 'gemma3:4b', kind: 'model', stage: 'analysis', elapsedMs: 92000, promptTokens: 220, generatedTokens: 180, requestPrompt: 'PROMPT ANALYSE ENVOYÉ', requestMetadata: { stream: true, think: false, format: 'json', imageCount: 0, keepAlive: 0, options: { contextTokens: 8192, generationTokenLimit: 2048 } }, raw: 'RÉPONSE ANALYSE BRUTE' },
      ],
    }]));
  });
  await page.goto('/');
  await page.waitForFunction(() => localStorage.getItem('companion-correcteur:timing-history:v1') === null);
  await page.evaluate(async () => {
    const request = indexedDB.open('companion-correcteur-devoir', 6);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('model-evaluations', 'readwrite');
    transaction.objectStore('model-evaluations').put({
      id: 'evaluation-e2e-1',
      completedAt: '2026-10-30T09:00:00.000Z',
      assignmentId: 'assignment-e2e',
      assignmentTitle: 'Biologie cellulaire',
      question: 'CONTENU PRIVÉ',
      rubricSnapshot: { title: 'Barème', criteria: [] },
      correctionMode: 'integrated',
      images: [{ base64: 'PRIVATE_EVALUATION_IMAGE', mimeType: 'image/jpeg' }],
      subjectImages: [],
      subjectTranscription: null,
      configurations: [{ id: 'profile-e2e', name: 'Profil Qwen local', endpoint: 'http://localhost:11434', visionModel: 'qwen3.5:4b', analysisModel: 'gemma3:4b', thinking: false }],
      results: [{
        profileId: 'profile-e2e',
        profileName: 'Qwen 3.5 · test comparatif',
        elapsedMs: 75000,
        readingMs: 25000,
        analysisMs: 50000,
        readingTokens: 100,
        analysisTokens: 200,
        tokens: 300,
        status: 'success',
        transcription: 'TRANSCRIPTION PRIVÉE ÉVALUATION',
        raw: 'SORTIE PRIVÉE ÉVALUATION',
        score: 16,
        proposal: null,
      }],
      stage: 'integrated',
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();

  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();

  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Suivi & diagnostic' }).click();
  await expect(page.getByRole('button', { name: 'Suivi & diagnostic' })).toHaveAttribute('aria-current', 'page');

  await expect(page.getByRole('heading', { name: 'Observabilité' })).toBeVisible();
  await expect(page.locator('.observability-local-badge, .observability-intro')).toHaveCount(0);
  await expect(page.getByText('Exécutions observées')).toBeVisible();
  await expect(page.getByText('Lecture par exceptions')).toBeVisible();
  await expect(page.getByText('Taux de modification après confirmation groupée')).toBeVisible();
  await expect(page.getByText('Dépassements des limites 18/12/12 mots')).toBeVisible();
  await expect(page.getByText('1 résultat(s) de modèle · 1 autre(s) exécution(s)')).toBeVisible();
  await expect(page.getByText('Qwen 3.5 · test comparatif').first()).toBeVisible();
  await expect(page.getByText('SCHÉMA SCIENTIFIQUE', { exact: true })).toBeVisible();
  await expect(page.getByText('TRANSCRIPTION PRIVÉE ÉVALUATION')).toHaveCount(0);
  await expect(page.getByText('SORTIE PRIVÉE ÉVALUATION')).toHaveCount(0);
  await expect(page.locator('.observability-model-list').getByText('qwen3.5:4b')).toBeVisible();
  await expect(page.locator('.observability-model-list').getByText('gemma3:4b')).toBeVisible();
  await expect(page.getByText('TRANSCRIPTION PRIVÉE À NE PAS AFFICHER')).toHaveCount(0);
  await expect(page.getByText('SORTIE PRIVÉE À NE PAS AFFICHER')).toHaveCount(0);

  const diagramTrace = page.locator('.observability-trace-details').filter({ has: page.locator('.observability-task-badge') });
  await diagramTrace.locator('summary').first().click();
  await expect(page.getByRole('heading', { name: 'Étapes de cette trace' })).toBeVisible();
  await expect(page.getByText('Tokens non remontés')).toHaveCount(0);
  await page.locator('.observability-call-details summary').first().click();
  await expect(page.getByText('Schéma scientifique · notation')).toBeVisible();
  await expect(page.locator('.observability-call-details').first()).toContainText('System prompt');
  await expect(page.locator('.observability-call-details').first()).toContainText('SYSTEM PROMPT VISION ENVOYÉ');
  await expect(page.locator('.observability-call-details').first()).toContainText('User prompt');
  await expect(page.locator('.observability-call-details').first()).toContainText('USER PROMPT VISION ENVOYÉ');
  await expect(page.getByText('RÉPONSE VISION BRUTE')).toBeVisible();
  await expect(page.getByText('PROMPT ANALYSE ENVOYÉ')).toBeHidden();
  await page.locator('.observability-call-details summary').nth(1).click();
  await expect(page.locator('.observability-call-details').nth(1)).toContainText('PROMPT ANALYSE ENVOYÉ');
  await expect(page.getByText('RÉPONSE ANALYSE BRUTE')).toBeVisible();
  await expect(page.locator('.observability-call-warning').first()).toContainText('Les octets des images ne sont pas affichés.');
  await expect(page.getByText('PRIVATE_EVALUATION_IMAGE')).toHaveCount(0);
});

test('a failed diagram campaign is visible with its two raw responses and validation error', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('companion-correcteur:timing-history:v1', JSON.stringify([{
      id: 'diagram-lab::evaluation-C::qwen::C::1',
      source: 'scientific-diagram',
      evaluationProfileName: 'Qwen 3.5:4B',
      completedAt: '2026-11-11T17:38:42.000Z',
      visionModel: 'qwen3.5:4b', analysisModel: 'qwen3.5:4b',
      thinking: false, correctionMode: 'integrated',
      pageCount: 1, readingSeconds: 0, analysisSeconds: 390,
      totalSeconds: 391, outcome: 'error', modelScore: null,
      criterionScores: [],
      assignmentTitle: 'Schéma C · passage 1 · Image → génératif direct',
      executionError: 'Sortie schéma invalide [diagram-output:invalid-points] : drawing.subcriteria.drawing-page.points attend un nombre entre 0 et 0.66 (reçu : -1).',
      diagnosticRuns: [
        { kind: 'model', model: 'qwen3.5:4b', stage: 'analysis',
          promptId: 'diagram.direct-grading', elapsedMs: 229000,
          raw: '{"criteria":{"drawing":{"points":-1}}}' },
        { kind: 'model', model: 'qwen3.5:4b', stage: 'analysis',
          promptId: 'diagram.direct-repair', elapsedMs: 162000,
          raw: '{"criteria":{"drawing":{"points":-1}}}' },
      ],
    }]));
  });
  await page.goto('/');
  await page.waitForFunction(() => localStorage.getItem('companion-correcteur:timing-history:v1') === null);
  await page.getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('button', { name: 'Suivi & diagnostic' }).click();

  await expect(page.getByRole('heading', { name: 'Observabilité' })).toBeVisible();
  await expect(page.getByText('Campagne · Qwen 3.5:4B')).toBeVisible();
  const trace = page.locator('.observability-trace-details').filter({ hasText: 'Campagne · Qwen 3.5:4B' });
  await trace.locator('summary').first().click();
  await expect(trace).toContainText('Schéma C · passage 1 · Image → génératif direct');
  await expect(trace.getByRole('alert')).toContainText('drawing.subcriteria.drawing-page.points');
  await expect(trace.locator('.observability-call-details')).toHaveCount(2);
  await trace.locator('.observability-call-details summary').nth(0).click();
  await trace.locator('.observability-call-details summary').nth(1).click();
  await expect(trace.getByText('{"criteria":{"drawing":{"points":-1}}}')).toHaveCount(2);
  await expect(page.getByText('PRIVATE_IMAGE_BYTES')).toHaveCount(0);
});
