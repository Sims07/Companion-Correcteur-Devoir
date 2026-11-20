import { expect, test } from '@playwright/test';

test('a validated copy can be regraded from saved pages with the edited assignment rubric', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const request = indexedDB.open('companion-correcteur-devoir', 7);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('local-corrections')) {
          const store = request.result.createObjectStore('local-corrections', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!request.result.objectStoreNames.contains('background-corrections')) {
          const store = request.result.createObjectStore('background-corrections', { keyPath: 'id' });
          store.createIndex('assignmentId', 'assignmentId', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });

    const historicalRubric = {
      title: 'Barème initial',
      criteria: [{ id: 'old-criterion', title: 'Ancien critère', description: '', maxPoints: 4 }],
    };
    const image = {
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQ6dH4DwADSAHIPzDQUwAAAABJRU5ErkJggg==',
      mimeType: 'image/png', fileName: 'copie-archivee.png',
    };
    const criterion = {
      criterionId: 'old-criterion', points: 3, teacherPoints: 3, teacherComment: '',
      decision: 'accepted', confidence: 'high', evidence: 'Ancienne preuve', rationale: '',
    };
    const transaction = database.transaction('local-corrections', 'readwrite');
    transaction.objectStore('local-corrections').put({
      id: 'validated-copy', label: 'Copie déjà validée',
      rubricTitle: 'Barème initial', rubricFingerprint: 'initial-4-points',
      createdAt: '2026-11-01T09:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z',
      assignmentId: 'assignment-default', assignmentTitle: 'Biologie',
      snapshot: {
        assignmentTitle: 'Biologie', question: 'Consigne initiale',
        rubric: historicalRubric,
        proposal: {
          summary: 'Proposition initiale', criteria: [criterion],
          finalScore: 3, questionsForTeacher: [],
        },
        review: [criterion], teacherQuestions: '',
        images: [image], originalImages: [image],
        transcription: 'Ancienne lecture', subjectImages: [], subjectTranscription: null,
        correctionMode: 'integrated', maximumPoints: 4,
      },
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();

    localStorage.setItem('companion-correcteur:assignments:v1', JSON.stringify([{
      id: 'assignment-default', title: 'Biologie', question: 'Consigne actuelle',
      correctionMode: 'integrated', kind: 'standard',
      rubric: {
        title: 'Barème actualisé',
        criteria: [{ id: 'new-criterion', title: 'Nouveau critère', description: '', maxPoints: 10 }],
      },
    }]));
    localStorage.setItem('companion-correcteur:active-assignment:v1', 'assignment-default');
    localStorage.setItem('companion-correcteur:auto-background-correction:v1', 'false');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'https://ai.example', apiCompatible: true,
      apiKey: 'test-token', visionModel: 'vision-model', analysisModel: 'analysis-model',
    }));
  });

  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await expect(page.getByRole('heading', { name: 'Suivi des copies' })).toBeVisible();
  await page.locator('.copy-overview-filters').getByRole('button', { name: /Corrigées/ }).click();
  await page.getByRole('button', { name: 'Autres actions pour Copie déjà validée' }).click();
  await expect(page.getByRole('button', { name: 'Recorriger', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Consulter la correction' }).click();
  await expect(page.getByRole('button', { name: 'Recorriger la copie' })).toBeVisible();

  // Merely opening an old archive must not revert the teacher's current rubric.
  const currentRubricBefore = await page.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem('companion-correcteur:assignments:v1') ?? '[]');
    return profiles.find((profile: { id: string }) => profile.id === 'assignment-default')?.rubric.title;
  });
  expect(currentRubricBefore).toBe('Barème actualisé');

  // Leaving the old review must restore an editable rubric, not lock the
  // assignment into its historical saved version.
  await page.getByRole('tab', { name: 'Barème' }).click();
  await expect(page.locator('#rubric-title')).toHaveValue('Barème actualisé');
  await page.locator('#rubric-title').fill('Barème actualisé corrigé');
  await expect.poll(async () => page.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem('companion-correcteur:assignments:v1') ?? '[]');
    return profiles.find((profile: { id: string }) => profile.id === 'assignment-default')?.rubric.title;
  })).toBe('Barème actualisé corrigé');

  await page.getByRole('tab', { name: 'Copies' }).click();
  await page.locator('.copy-overview-filters').getByRole('button', { name: /Corrigées/ }).click();
  await page.getByRole('button', { name: 'Consulter la correction' }).click();
  await page.getByRole('button', { name: 'Recorriger la copie' }).click();
  await expect.poll(async () => page.evaluate(async () => {
    const request = indexedDB.open('companion-correcteur-devoir', 7);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(['background-corrections', 'local-corrections'], 'readonly');
    const jobsRequest = transaction.objectStore('background-corrections').getAll();
    const correctionRequest = transaction.objectStore('local-corrections').get('validated-copy');
    const jobs = await new Promise<Array<{
      regradeOfCorrectionId?: string;
      rubric: { title: string; criteria: Array<{ id: string }> };
      images: Array<{ base64: string }>;
    }>>((resolve, reject) => {
      jobsRequest.onsuccess = () => resolve(jobsRequest.result);
      jobsRequest.onerror = () => reject(jobsRequest.error);
    });
    const historical = await new Promise<{ snapshot: { rubric: { title: string }; proposal: { finalScore: number } } }>((resolve, reject) => {
      correctionRequest.onsuccess = () => resolve(correctionRequest.result);
      correctionRequest.onerror = () => reject(correctionRequest.error);
    });
    db.close();
    const attempt = jobs.find((job) => job.regradeOfCorrectionId === 'validated-copy');
    return {
      currentRubric: attempt?.rubric.title ?? null,
      criterionId: attempt?.rubric.criteria[0]?.id ?? null,
      pages: attempt?.images.length ?? 0,
      archivedRubric: historical.snapshot.rubric.title,
      previousScore: historical.snapshot.proposal.finalScore,
    };
  })).toEqual({
    currentRubric: 'Barème actualisé corrigé',
    criterionId: 'new-criterion',
    pages: 1,
    archivedRubric: 'Barème initial',
    previousScore: 3,
  });
});
