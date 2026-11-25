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
    // The active devoir and queued job must share the same authoritative rubric.
    localStorage.setItem('companion-correcteur:assignments:v1', JSON.stringify([{
      id: 'assignment-default', title: 'Cellule', question: 'Décrire la membrane.',
      correctionMode: 'integrated', rubric,
    }]));
    localStorage.setItem('companion-correcteur:active-assignment:v1', 'assignment-default');
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
  const annotations = page.getByRole('region', { name: 'Annotations de la copie' });
  await expect(criterion.getByRole('button', { name: 'Annoter la copie' })).toHaveCount(0);
  await toggle.check();
  await criterion.getByRole('button', { name: 'Annoter la copie' }).click();
  await expect(annotations.getByRole('textbox', { name: 'Remarque' })).toHaveValue('Préciser la membrane.');
  await annotations.getByRole('button', { name: 'Placer sur la copie' }).click();
  await page.addStyleTag({ content: '.copy-annotation-canvas .zoomable-image-trigger, .copy-annotation-canvas img { width: 300px !important; height: 200px !important; }' });
  const target = page.getByRole('button', { name: 'Placer l’annotation sur la page 1' });
  await target.click({ position: { x: 140, y: 80 } });
  await expect(annotations.getByText('1. Préciser la membrane.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Annotation 1 : Préciser la membrane.' })).toBeVisible();

  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('companion-correcteur-devoir', 7);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const job = await new Promise<{ copyAnnotations?: Array<{ criterionId?: string; placement?: { pageNumber: number } }> } | undefined>((resolve, reject) => {
      const request = db.transaction('background-corrections').objectStore('background-corrections').get('annotation-teacher-copy');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return job?.copyAnnotations?.find((item) => item.criterionId === 'membrane')?.placement?.pageNumber;
  })).toBe(1);

  const firstX = await page.locator('.copy-inline-annotation').evaluate((node) => (node as HTMLElement).style.left);
  await annotations.getByRole('button', { name: 'Déplacer sur la copie' }).click();
  await target.click({ position: { x: 200, y: 120 } });
  await expect.poll(() => page.locator('.copy-inline-annotation').evaluate((node) => (node as HTMLElement).style.left)).not.toBe(firstX);

  await annotations.getByRole('button', { name: 'Ajouter' }).click();
  await target.click({ position: { x: 50, y: 50 } });
  await annotations.getByRole('textbox', { name: 'Remarque' }).fill('Très bon dessin !');
  await expect(annotations.getByRole('combobox', { name: 'Critère associé' })).toHaveValue('');
  await annotations.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.copy-inline-annotation')).toHaveCount(2);
  await expect(criterion.getByText('1 / 2', { exact: true })).toBeVisible();

  await toggle.uncheck();
  await expect(page.locator('.copy-inline-annotation')).toHaveCount(0);
  await expect(annotations).toHaveCount(0);
  await toggle.check();
  await expect(page.locator('.copy-inline-annotation')).toHaveCount(2);
  await annotations.getByRole('listitem').filter({ hasText: 'Très bon dessin !' }).getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('.copy-inline-annotation')).toHaveCount(1);
  expect(requests.slice(requestsBeforeAnnotations)).toEqual([]);
});
