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

async function seedJobs(page: Page, jobs: Array<{ id: string; label: string; status: 'ready' | 'failed' | 'pending' | 'processing'; updatedAt: string; error?: string }>, readyProposal = proposal) {
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
        phase: item.status === 'ready' ? 'complete' : item.status === 'pending' ? 'preparation' : item.status === 'processing' ? 'grading' : 'reading',
        completedPages: item.status === 'ready' || item.status === 'processing' ? 1 : 0,
        completedCriteria: item.status === 'ready' ? 3 : item.status === 'processing' ? 1 : 0,
        totalCriteria: 3,
        transcription: item.status === 'ready' || item.status === 'processing' ? 'Transcription de test en cours.' : null,
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
  }, { input: jobs, rubric, pageImage, proposal: readyProposal });
}

function copyNavigation(page: Page) {
  return page.getByRole('tab', { name: /Copies/ });
}


test('opening a copy whose analysis is running shows its individual correction progress', async ({ page }) => {
  await prepareLocalWorkspace(page);
  await seedJobs(page, [
    { id: 'copy-processing', label: 'Copie en cours', status: 'processing', updatedAt: '2026-11-02T09:00:00.000Z' },
  ]);
  await page.reload();
  await openActiveAssignment(page);
  await copyNavigation(page).click();

  await page.getByRole('button', { name: /Analyse en cours/ }).click();
  const processingCard = page.locator('.copy-overview-grid .correction-series-card');
  await expect(processingCard).toContainText('Copie en cours');
  await processingCard.getByRole('button', { name: 'Ouvrir' }).click();

  await expect(page.getByRole('heading', { name: 'Correction en cours' })).toBeVisible();
  await expect(page.getByText('La copie en cours de correction')).toBeVisible();
  await expect(page.getByText('1/1 pages lues')).toBeVisible();
  await expect(page.getByText('1/3 critères traités')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Avancement du barème' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Critères du barème traités' })).toHaveAttribute('aria-valuenow', '1');
  await page.getByText('Consulter le texte reconnu').click();
  await expect(page.getByText('Transcription de test en cours.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toHaveCount(0);
});

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
  await expect(page.getByRole('textbox', { name: 'Nom de l’étudiant' })).toHaveValue('Copie récente');
  const copyRail = page.getByRole('complementary', { name: 'Navigation entre les copies' });
  await expect(copyRail).toBeVisible();
  await copyRail.getByRole('button', { name: /Copie ancienne/ }).click();
  await expect(page.getByRole('textbox', { name: 'Nom de l’étudiant' })).toHaveValue('Copie ancienne');
  await copyRail.getByRole('button', { name: /Copie récente/ }).click();
  await expect(page.getByRole('textbox', { name: 'Nom de l’étudiant' })).toHaveValue('Copie récente');

  await copyNavigation(page).click();
  await expect(page.getByRole('heading', { name: 'Suivi des copies' })).toBeVisible();
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter des copies/ }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter des copies' })).toBeVisible();

  await copyNavigation(page).click();
  await expect(page.getByText('Copie récente')).toBeVisible();
  await expect(page.getByText('Copie ancienne')).toBeVisible();
});

test('teacher verifies a flagged criterion, validates the copy and lands on the next one', async ({ page }) => {
  await prepareLocalWorkspace(page);
  await seedJobs(page, [
    { id: 'copy-older', label: 'Copie ancienne', status: 'ready', updatedAt: '2026-11-01T08:00:00.000Z' },
    { id: 'copy-newer', label: 'Copie récente', status: 'ready', updatedAt: '2026-11-02T09:00:00.000Z' },
  ]);
  await page.reload();
  await openActiveAssignment(page);
  await copyNavigation(page).click();

  await page.getByRole('button', { name: 'Vérifier la copie suivante' }).click();
  const studentName = page.getByRole('textbox', { name: 'Nom de l’étudiant' });
  await expect(studentName).toHaveValue('Copie récente');

  const flaggedCard = page.locator('.review-card').filter({ has: page.getByRole('heading', { name: 'Connaissances scientifiques' }) });
  await expect(flaggedCard.getByText('Point retiré', { exact: true })).toBeVisible();
  await flaggedCard.focus();
  await page.keyboard.press('Enter');
  await expect(flaggedCard.getByText('Confirmé', { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.review-card').nth(1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(flaggedCard).toBeFocused();
  await flaggedCard.getByLabel('Votre note').fill('7');
  await expect(flaggedCard.getByText('7 / 8')).toBeVisible();

  await page.keyboard.press('Control+Enter');
  await expect(studentName).toHaveValue('Copie ancienne');
  await expect(page.getByRole('heading', { name: 'Connaissances scientifiques' })).toBeVisible();
});

test('a copy without alerts can be validated in one action and advances to the next copy', async ({ page }) => {
  await prepareLocalWorkspace(page);
  const fullCreditProposal = {
    ...proposal,
    criteria: rubric.criteria.map((criterion) => ({
      criterionId: criterion.id,
      points: criterion.maxPoints,
      rationale: 'Le critère est pleinement satisfait.',
      evidence: 'La réponse apporte une preuve précise et suffisante.',
      confidence: 'high' as const,
    })),
    finalScore: 20,
  };
  await seedJobs(page, [
    { id: 'copy-older', label: 'Copie suivante', status: 'ready', updatedAt: '2026-11-01T08:00:00.000Z' },
    { id: 'copy-newer', label: 'Copie sans alerte', status: 'ready', updatedAt: '2026-11-02T09:00:00.000Z' },
  ], fullCreditProposal);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  await openActiveAssignment(page);
  await copyNavigation(page).click();
  await page.getByRole('button', { name: 'Vérifier la copie suivante' }).click();

  const studentName = page.getByRole('textbox', { name: 'Nom de l’étudiant' });
  await expect(studentName).toHaveValue('Copie sans alerte');
  await expect(page.locator('.copy-review-alert-strip')).toHaveCount(0);
  await expect(page.locator('.review-card')).toHaveCount(0);
  await expect(page.locator('.review-safe-summary-row')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tout confirmer' })).toHaveCount(0);
  await expect(page.locator('.copy-review-validation-bar')).toContainText('Tous les critères sont notés');
  const validate = page.getByRole('button', { name: 'Valider et passer à la suivante' }).first();
  await expect(validate).toBeEnabled();
  await validate.click();
  await expect(studentName).toHaveValue('Copie suivante');
});

test('a failed copy is kept in À corriger and the Corriger action starts a new attempt', async ({ page }) => {
  await prepareLocalWorkspace(page);
  await seedJobs(page, [
    { id: 'copy-failed', label: 'Copie en échec', status: 'failed', updatedAt: '2026-11-02T09:00:00.000Z', error: 'La correction n’a pas abouti. Vous pouvez corriger à nouveau cette copie.' },
  ]);
  let retryRequests = 0;
  await page.route('https://ai.example/**', async (route) => {
    retryRequests += 1;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service temporairement indisponible' }) });
  });
  await page.reload();
  await openActiveAssignment(page);
  await copyNavigation(page).click();

  await page.getByRole('button', { name: /À corriger/ }).click();
  const failedCard = page.locator('.copy-overview-grid .correction-series-card');
  await expect(failedCard).toContainText('Copie en échec');
  await expect(failedCard).toContainText('La correction n’a pas abouti. Vous pouvez corriger à nouveau cette copie.');
  await failedCard.getByRole('button', { name: 'Corriger' }).click();

  await expect.poll(() => retryRequests).toBeGreaterThan(0);
  await expect(failedCard).toContainText('À corriger');
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
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter des copies/ }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter des copies' })).toBeVisible();

  await copyNavigation(page).click();
  await expect(page.getByText('copie-a-conserver.png')).toBeVisible();
  await expect(page.getByRole('button', { name: /En attente/ })).toContainText('1');
});


test('opening a queued copy never displays a fictitious zero grade', async ({ page }) => {
  await prepareLocalWorkspace(page);
  await seedJobs(page, [
    { id: 'copy-queued', label: 'Copie non évaluée', status: 'pending', updatedAt: '2026-11-02T08:00:00.000Z' },
  ]);
  await page.reload();
  await openActiveAssignment(page);
  await copyNavigation(page).click();
  await page.locator('.copy-overview-grid .correction-series-card').getByRole('button', { name: 'Ouvrir' }).click();

  await expect(page.getByRole('textbox', { name: 'Nom de l’étudiant' })).toHaveValue('Copie non évaluée');
  await expect(page.locator('.copy-review-header-score')).toHaveText('Note à venir');
  await expect(page.getByText('Cette copie attend sa correction. Aucune note n’a encore été attribuée.', { exact: true })).toBeVisible();
});

test('teacher can explicitly start correction for copies already loaded in the assignment', async ({ page }) => {
  await prepareLocalWorkspace(page);
  await seedJobs(page, [
    { id: 'copy-pending-1', label: 'Copie en attente 1', status: 'pending', updatedAt: '2026-11-02T08:00:00.000Z' },
    { id: 'copy-pending-2', label: 'Copie en attente 2', status: 'pending', updatedAt: '2026-11-02T09:00:00.000Z' },
  ]);
  let correctionRequests = 0;
  await page.route('https://ai.example/**', async (route) => {
    correctionRequests += 1;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service temporairement indisponible' }) });
  });
  await page.reload();
  await openActiveAssignment(page);
  await copyNavigation(page).click();

  const launch = page.getByRole('button', { name: 'Démarrer les corrections (2)' });
  await expect(launch).toBeVisible();
  await expect(launch).toBeEnabled();
  await launch.click();
  await expect.poll(() => correctionRequests).toBeGreaterThan(0);
  await expect(page.locator('.copy-overview-grid .correction-series-card').filter({ hasText: 'Copie en attente 1' })).toBeVisible();
  await expect(page.locator('.copy-overview-grid .correction-series-card').filter({ hasText: 'Copie en attente 2' })).toBeVisible();
});
