import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

test('teacher can opt in, place, move and hide a synthetic remark without any LLM call', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/chat|\/v1\/chat|\/v1\/completions/.test(request.url())) requests.push(request.url());
  });

  await page.goto('/');
  await openActiveAssignment(page);
  await page.evaluate(async () => {
    localStorage.setItem('companion-correcteur:auto-background-correction:v1', 'false');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('companion-correcteur-devoir', 7);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rubric = { title: 'Cellule', criteria: [{ id: 'membrane', title: 'Membrane', description: 'Décrire la membrane.', maxPoints: 2 }] };
    const criterion = { criterionId: 'membrane', points: 1, rationale: 'Description partielle.', evidence: 'Membrane visible.', confidence: 'high', annotationSuggestion: 'Préciser la membrane.', pageNumber: 1 };
    const proposal = { summary: '', criteria: [criterion], questionsForTeacher: [], finalScore: 1 };
    const image = { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=', mimeType: 'image/png', fileName: 'page.png' };
    const transaction = db.transaction('background-corrections', 'readwrite');
    transaction.objectStore('background-corrections').put({
      id: 'annotation-teacher-copy',
      assignmentId: 'assignment-default',
      label: 'Copie à annoter',
      question: 'Décrire la membrane.',
      rubric,
      correctionMode: 'integrated',
      images: [image],
      originalImages: [image],
      subjectImages: [],
      detectTeacherAnnotations: false,
      annotationInkColor: 'none',
      annotationInkColorApplied: true,
      visionModel: 'vision',
      analysisModel: 'analysis',
      thinking: false,
      createdAt: '2026-11-23T09:00:00.000Z',
      updatedAt: '2026-11-23T09:00:00.000Z',
      status: 'ready',
      phase: 'complete',
      completedPages: 1,
      completedCriteria: 1,
      activeCriterionId: null,
      totalCriteria: 1,
      transcription: 'Membrane visible.',
      partialCriteria: [criterion],
      proposal,
      error: null,
      imageFingerprint: null,
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });

  await page.reload();
  await openActiveAssignment(page);
  await page.getByRole('tab', { name: /Copies/ }).click();
  const card = page.locator('.copy-overview-grid .correction-series-card').filter({ hasText: 'Copie à annoter' });
  await card.getByRole('button', { name: 'Vérifier la copie' }).click();

  const toggle = page.getByRole('checkbox', { name: 'Annoter la copie' });
  const criterion = page.locator('.review-card').filter({ has: page.getByRole('heading', { name: 'Membrane' }) });
  await expect(toggle).not.toBeChecked();
  const requestsBeforeAnnotations = requests.length;
  await expect(criterion.getByRole('button', { name: 'Placer sur la copie' })).toHaveCount(0);
  await toggle.check();
  await expect(criterion.getByRole('button', { name: 'Placer sur la copie' })).toBeVisible();
  await criterion.getByRole('button', { name: 'Placer sur la copie' }).click();
  // A one-pixel synthetic fixture is enlarged for hit-target testing only.
  await page.addStyleTag({ content: '.copy-annotation-canvas .zoomable-image-trigger, .copy-annotation-canvas img { width: 300px !important; height: 200px !important; }' });
  await page.getByRole('button', { name: 'Placer l’annotation sur la page 1' }).click({ position: { x: 140, y: 80 } });
  await expect(page.locator('.copy-inline-annotation')).toHaveCount(1);
  await expect(page.locator('.copy-inline-annotation')).toContainText('Préciser la membrane.');
  // Queued reviews must be saved immediately, not only when navigating away.
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('companion-correcteur-devoir', 7);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const job = await new Promise<{ reviewDraft?: Array<{ criterionId: string; annotationPlacement?: { pageNumber: number } }> } | undefined>((resolve, reject) => {
      const request = db.transaction('background-corrections').objectStore('background-corrections').get('annotation-teacher-copy');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return job?.reviewDraft?.find((item) => item.criterionId === 'membrane')?.annotationPlacement?.pageNumber;
  })).toBe(1);
  const firstX = await page.locator('.copy-inline-annotation').evaluate((node) => (node as HTMLElement).style.left);
  await criterion.getByRole('button', { name: 'Déplacer sur la copie' }).click();
  await page.getByRole('button', { name: 'Placer l’annotation sur la page 1' }).click({ position: { x: 200, y: 120 } });
  await expect.poll(() => page.locator('.copy-inline-annotation').evaluate((node) => (node as HTMLElement).style.left)).not.toBe(firstX);
  await toggle.uncheck();
  await expect(page.locator('.copy-inline-annotation')).toHaveCount(0);
  await expect(criterion.getByRole('button', { name: 'Déplacer sur la copie' })).toHaveCount(0);
  await toggle.check();
  await expect(page.locator('.copy-inline-annotation')).toHaveCount(1);
  await criterion.getByRole('button', { name: 'Retirer l’annotation' }).click();
  await expect(page.locator('.copy-inline-annotation')).toHaveCount(0);
  expect(requests.slice(requestsBeforeAnnotations)).toEqual([]);
});
