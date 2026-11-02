import { expect, test, type Page } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

const pageImage = {
  base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=',
  mimeType: 'image/png',
  fileName: 'page-1.png',
};
const rubric = {
  title: 'Barème de biologie — exemple',
  criteria: [
    { id: 'knowledge', title: 'Connaissances scientifiques', description: 'Exactitude des notions et du vocabulaire.', maxPoints: 8 },
    { id: 'reasoning', title: 'Raisonnement', description: 'Qualité de l’argumentation et des liens logiques.', maxPoints: 7 },
    { id: 'clarity', title: 'Clarté de la réponse', description: 'Structure et lisibilité de la réponse.', maxPoints: 5 },
  ],
};
const proposal = {
  summary: 'Proposition prête à vérifier.',
  criteria: [
    { criterionId: 'knowledge', points: 6, rationale: 'Notions partiellement maîtrisées.', evidence: 'La réponse décrit les notions principales.', confidence: 'high' },
    { criterionId: 'reasoning', points: 5, rationale: 'Le raisonnement est cohérent.', evidence: 'Les étapes sont reliées.', confidence: 'high' },
    { criterionId: 'clarity', points: 4, rationale: 'La réponse est lisible.', evidence: 'Les phrases sont structurées.', confidence: 'high' },
  ],
  questionsForTeacher: [],
  finalScore: 15,
};

async function prepareLocalWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
  await page.evaluate(() => {
    localStorage.setItem('companion-correcteur:auto-background-correction:v1', 'false');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'https://ai.example/v1',
      apiCompatible: true,
      apiKey: 'test-token',
      visionModel: 'vision-model',
      analysisModel: 'analysis-model',
    }));
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
}

async function seedJobs(page: Page, jobs: Array<{ id: string; label: string; status: 'ready' | 'failed'; updatedAt: string; error?: string }>) {
  await page.evaluate(async ({ input, rubric: jobRubric, pageImage: image, proposal: readyProposal }) => {
    const request = indexedDB.open('companion-correcteur-devoir', 5);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => reject(new Error('La base locale doit être initialisée avant le test.'));
    });
    const transaction = database.transaction('background-corrections', 'readwrite');
    for (const item of input) {
      const now = item.updatedAt;
      transaction.objectStore('background-corrections').put({
        id: item.id,
        assignmentId: 'assignment-default',
        label: item.label,
        question: 'Évaluez la réponse manuscrite à la question de biologie.',
        rubric: jobRubric,
        correctionMode: 'integrated',
        images: [image],
        originalImages: [image],
        subjectImages: [],
        detectTeacherAnnotations: false,
        annotationInkColor: 'none',
        annotationInkColorApplied: true,
        visionModel: 'vision-model',
        analysisModel: 'analysis-model',
        thinking: false,
        createdAt: now,
        updatedAt: now,
        status: item.status,
        phase: item.status === 'ready' ? 'complete' : 'reading',
        completedPages: item.status === 'ready' ? 1 : 0,
        completedCriteria: item.status === 'ready' ? 3 : 0,
        totalCriteria: 3,
        transcription: item.status === 'ready' ? 'Transcription de test.' : null,
        partialCriteria: item.status === 'ready' ? readyProposal.criteria : [],
        proposal: item.status === 'ready' ? readyProposal : null,
        error: item.error ?? null,
        imageFingerprint: null,
      });
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, { input: jobs, rubric, pageImage, proposal });
}

function copyNavigation(page: Page) {
  return page.locator('.teacher-step-nav').getByRole('button', { name: /Copies/ });
}

test('adding a copy while another one is under review keeps the previous copy and opens the next copy by priority', async ({ page }) => {
  await prepareLocalWorkspace(page);
  await seedJobs(page, [
    { id: 'copy-older', label: 'Copie ancienne', status: 'ready', updatedAt: '2026-11-01T08:00:00.000Z' },
    { id: 'copy-newer', label: 'Copie récente', status: 'ready', updatedAt: '2026-11-02T09:00:00.000Z' },
  ]);
  await page.reload();
  await openActiveAssignment(page);
  await copyNavigation(page).click();

  await expect(page.getByRole('button', { name: /À vérifier/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Vérifier la copie suivante' }).click();
  await expect(page.getByLabel('Nom lu sur la copie')).toHaveValue('Copie récente');

  await copyNavigation(page).click();
  await expect(page.getByRole('heading', { name: 'Suivi des copies' })).toBeVisible();
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter une copie/ }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();

  await copyNavigation(page).click();
  await expect(page.getByText('Copie récente')).toBeVisible();
  await expect(page.getByText('Copie ancienne')).toBeVisible();
});

test('a failed copy is kept in À reprendre and the Reprendre action starts a new attempt', async ({ page }) => {
  await prepareLocalWorkspace(page);
  await seedJobs(page, [
    { id: 'copy-failed', label: 'Copie en échec', status: 'failed', updatedAt: '2026-11-02T09:00:00.000Z', error: 'La correction n’a pas abouti. Vérifiez les paramètres de l’IA locale puis réessayez.' },
  ]);
  let retryRequests = 0;
  await page.route('https://ai.example/**', async (route) => {
    retryRequests += 1;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service temporairement indisponible' }) });
  });
  await page.reload();
  await openActiveAssignment(page);
  await copyNavigation(page).click();

  await page.getByRole('button', { name: /À reprendre/ }).click();
  const failedCard = page.locator('.copy-overview-grid .correction-series-card');
  await expect(failedCard).toContainText('Copie en échec');
  await expect(failedCard).toContainText('La correction n’a pas abouti. Vérifiez les paramètres de l’IA locale puis réessayez.');
  await failedCard.getByRole('button', { name: 'Reprendre' }).click();

  await expect.poll(() => retryRequests).toBeGreaterThan(0);
  await expect(failedCard).toContainText('À reprendre');
});

test('adding another copy automatically saves the imported foreground copy in the overview', async ({ page }) => {
  await prepareLocalWorkspace(page);
  await openActiveAssignment(page);
  await page.locator('#copy-files').setInputFiles({
    name: 'copie-a-conserver.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pageImage.base64, 'base64'),
  });
  await expect(page.getByRole('button', { name: 'Agrandir la page 1' })).toBeVisible();

  await copyNavigation(page).click();
  await expect(page.getByText('copie-a-conserver.png')).toBeVisible();
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter une copie/ }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();

  await copyNavigation(page).click();
  await expect(page.getByText('copie-a-conserver.png')).toBeVisible();
  await expect(page.getByRole('button', { name: /En attente/ })).toContainText('1');
});
