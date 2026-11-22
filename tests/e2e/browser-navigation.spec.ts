import { expect, test } from '@playwright/test';

test('refresh, browser back and forward preserve the teacher assignment and section', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/#\/devoirs$/);
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await expect(page).toHaveURL(/#\/devoir\/assignment-default\/copies$/);
  await page.getByRole('tab', { name: 'Barème' }).click();
  await expect(page).toHaveURL(/#\/devoir\/assignment-default\/bareme$/);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Devoir et barème' })).toBeVisible();
  await expect(page).toHaveURL(/#\/devoir\/assignment-default\/bareme$/);

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Suivi des copies' })).toBeVisible();
  await expect(page).toHaveURL(/#\/devoir\/assignment-default\/copies$/);

  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Devoir et barème' })).toBeVisible();
  await expect(page).toHaveURL(/#\/devoir\/assignment-default\/bareme$/);

  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  await expect(page).toHaveURL(/#\/devoirs$/);
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
});

test('evaluation and diagnosis remain addressable after reload and browser navigation', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
  await navigation.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await expect(page).toHaveURL(/#\/evaluation\/dashboard$/);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Évaluer les modèles' })).toHaveAttribute('aria-current', 'page');

  await navigation.getByRole('button', { name: 'Suivi & diagnostic' }).click();
  await expect(page).toHaveURL(/#\/reseau$/);
  await expect(page.getByRole('heading', { name: 'Inspecteur réseau' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Détails du suivi' }).getByRole('button', { name: 'Suivi des corrections' }).click();
  await expect(page).toHaveURL(/#\/suivi$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Observabilité' })).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Inspecteur réseau' })).toBeVisible();
  await expect(page).toHaveURL(/#\/reseau$/);
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Observabilité' })).toBeVisible();
  await page.goto('/#/reseau');
  await expect(page.getByRole('heading', { name: 'Inspecteur réseau' })).toBeVisible();
  await page.goto('/#/suivi');
  await expect(page.getByRole('heading', { name: 'Observabilité' })).toBeVisible();
});

test('deep link to deleted or unknown copy falls back to the right assignment without losing its identity', async ({ page }) => {
  await page.goto('/#/devoir/assignment-default/copie/unknown-local-copy');
  await expect(page.getByRole('heading', { name: 'Suivi des copies' })).toBeVisible();
  await expect(page).toHaveURL(/#\/devoir\/assignment-default\/copies$/);
  await expect(page.getByText('Cette copie n’est plus disponible sur cet appareil.')).toBeVisible();
});

test('copy route is recovered from local IndexedDB after refresh', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.setItem('companion-correcteur:auto-background-correction:v1', 'false');
    const request = indexedDB.open('companion-correcteur-devoir', 7);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rubric = { title: 'Biologie', criteria: [{ id: 'c1', title: 'Critère', description: '', maxPoints: 10 }] };
    const image = { fileName: 'copie.png', mimeType: 'image/png', base64: 'aA==' };
    const proposal = { summary: 'Réponse', criteria: [{ criterionId: 'c1', points: 8, rationale: 'Correct', evidence: 'Présent', pageNumber: 1, confidence: 'high' }], questionsForTeacher: [], finalScore: 8 };
    const tx = database.transaction('background-corrections', 'readwrite');
    tx.objectStore('background-corrections').put({
      id: 'queued-copy-browser-route', assignmentId: 'assignment-default', label: 'Copie locale à retrouver',
      question: 'Question de biologie', rubric, correctionMode: 'integrated', images: [image],
      originalImages: [image], subjectImages: [], detectTeacherAnnotations: false,
      annotationInkColor: 'none', annotationInkColorApplied: true, visionModel: 'vision',
      analysisModel: 'analysis', thinking: false, createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z', status: 'ready', phase: 'complete',
      completedPages: 1, completedCriteria: 1, totalCriteria: 1, transcription: 'Réponse',
      partialCriteria: proposal.criteria, proposal, reviewDraft: [], teacherQuestionsDraft: '',
      error: null, imageFingerprint: null,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    database.close();
  });

  await page.goto('/#/devoir/assignment-default/copie/queued-copy-browser-route');
  await expect(page.locator('.copy-review-identity-title h2')).toHaveText('Copie locale à retrouver');
  await expect(page).toHaveURL(/#\/devoir\/assignment-default\/copie\/queued-copy-browser-route$/);
  await page.reload();
  await expect(page.locator('.copy-review-identity-title h2')).toHaveText('Copie locale à retrouver');
  await expect(page.locator('.teacher-copy-rail-list button[aria-current="page"]')).toContainText('Copie locale à retrouver');
});

test('rubric anchors scroll and focus without replacing the addressable teacher route', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  const expectedRoute = /#\/devoir\/assignment-default\/bareme$/;
  await expect(page).toHaveURL(expectedRoute);

  await page.getByRole('link', { name: 'Réutiliser, importer ou exporter' }).click();
  await expect(page.getByRole('heading', { name: 'Réutiliser, importer ou exporter des critères' })).toBeFocused();
  await expect(page).toHaveURL(expectedRoute);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Devoir et barème' })).toBeVisible();
  await expect(page).toHaveURL(expectedRoute);
});
