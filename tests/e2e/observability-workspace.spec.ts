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
        { model: 'qwen3.5:4b', kind: 'vision', stage: 'reading', purpose: 'scientific-diagram-analysis', elapsedMs: 48000, promptTokens: 80, generatedTokens: 120, requestPayload: JSON.stringify({ attempts: [{ messages: [{ role: 'system', content: 'SYSTEM PROMPT VISION ENVOYÉ' }, { role: 'user', content: 'USER PROMPT VISION ENVOYÉ' }] }] }), requestMetadata: { stream: true, think: false, imageCount: 1, keepAlive: 0, options: { contextTokens: 4096, generationTokenLimit: 2048 } }, raw: 'RÉPONSE VISION BRUTE' },
        { model: 'gemma3:4b', kind: 'model', stage: 'analysis', elapsedMs: 92000, promptTokens: 220, generatedTokens: 180, requestPrompt: 'PROMPT ANALYSE ENVOYÉ', requestMetadata: { stream: true, think: false, format: 'json', imageCount: 0, keepAlive: 0, options: { contextTokens: 8192, generationTokenLimit: 2048 } }, raw: 'RÉPONSE ANALYSE BRUTE' },
      ],
    }]));
  });

  await page.addInitScript(() => {
    const request = indexedDB.open('companion-correcteur-devoir', 3);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('local-memory')) {
        const store = database.createObjectStore('local-memory', { keyPath: 'id' });
        store.createIndex('correctionId', 'correctionId', { unique: false });
        store.createIndex('rubricFingerprint', 'rubricFingerprint', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!database.objectStoreNames.contains('local-corrections')) {
        const store = database.createObjectStore('local-corrections', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!database.objectStoreNames.contains('model-evaluations')) {
        const store = database.createObjectStore('model-evaluations', { keyPath: 'id' });
        store.createIndex('completedAt', 'completedAt', { unique: false });
        store.createIndex('assignmentId', 'assignmentId', { unique: false });
      }
    };
    request.onsuccess = () => {
      const transaction = request.result.transaction('model-evaluations', 'readwrite');
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
    };
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Observabilité' }).click();

  await expect(page.getByRole('heading', { name: 'Observabilité' })).toBeVisible();
  await expect(page.getByText('Exécutions observées')).toBeVisible();
  await expect(page.getByText('Lecture par exceptions')).toBeVisible();
  await expect(page.getByText('Taux de modification après confirmation groupée')).toBeVisible();
  await expect(page.getByText('Dépassements des limites 18/12/12 mots')).toBeVisible();
  await expect(page.getByText('1 résultat(s) de modèle · 1 correction(s)')).toBeVisible();
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
  await expect(page.locator('.observability-call-warning').first()).toContainText('stockage local');
  await expect(page.getByText('PRIVATE_EVALUATION_IMAGE')).toHaveCount(0);
});
