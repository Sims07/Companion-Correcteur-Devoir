import { expect, test, type Page } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

async function openAnnotationReview(page: Page) {
  await page.goto('/');
  await openActiveAssignment(page);
  await page.evaluate(async () => {
    localStorage.setItem('companion-correcteur:auto-background-correction:v1', 'false');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({ endpoint: 'http://127.0.0.1:11434', visionModel: 'vision', generativeModel: 'analysis' }));
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
    const image = { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC', mimeType: 'image/png', fileName: 'page.png' };
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

}

test('teacher can opt in, place, move and hide a synthetic remark without any LLM call', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/chat|\/v1\/chat|\/v1\/completions/.test(request.url())) requests.push(request.url());
  });

  await openAnnotationReview(page);
  const toggle = page.getByRole('switch', { name: 'Annotations' });
  const criterion = page.locator('.review-card').filter({ has: page.getByRole('heading', { name: 'Membrane' }) });
  await expect(toggle).not.toBeChecked();
  const requestsBeforeAnnotations = requests.length;
  const annotations = page.getByRole('region', { name: 'Annotations de la copie' });
  await expect(criterion.getByRole('button', { name: 'Annoter la copie' })).toHaveCount(0);
  await toggle.check();
  await expect(annotations.getByRole('button', { name: 'Annotations (0)' })).toHaveAttribute('aria-expanded', 'false');
  await criterion.getByRole('button', { name: 'Annoter la copie' }).click();
  await expect(annotations.getByRole('textbox', { name: 'Remarque' })).toHaveValue('Préciser la membrane.');
  await annotations.getByRole('button', { name: 'Placer sur la copie' }).click();
  await page.addStyleTag({ content: '.copy-annotation-canvas .zoomable-image-trigger, .copy-annotation-canvas img { width: 300px !important; height: 200px !important; }' });
  const target = page.getByRole('button', { name: 'Placer l’annotation sur la page 1' });
  await target.click({ position: { x: 140, y: 80 } });
  await expect(annotations.getByRole('button', { name: 'Annotations (1)' })).toHaveAttribute('aria-expanded', 'false');
  await annotations.getByRole('button', { name: 'Annotations (1)' }).click();
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
  await expect(criterion.locator('.review-card-result strong')).toHaveText('1 / 2');

  await toggle.uncheck();
  await expect(page.locator('.copy-inline-annotation')).toHaveCount(0);
  await expect(annotations).toHaveCount(0);
  await toggle.check();
  await expect(page.locator('.copy-inline-annotation')).toHaveCount(2);
  await page.getByRole('button', { name: 'Annotation 2 : Très bon dessin !' }).click();
  await expect(annotations.getByRole('listitem').filter({ hasText: 'Très bon dessin !' })).toBeFocused();
  await annotations.getByRole('listitem').filter({ hasText: 'Très bon dessin !' }).getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('.copy-inline-annotation')).toHaveCount(1);
  expect(requests.slice(requestsBeforeAnnotations)).toEqual([]);
});

test('generates reviewable suggestions, survives tab navigation and supports cancellation and retry', async ({ page }) => {
  let calls = 0;
  let release = () => {};
  await page.route('http://127.0.0.1:11434/api/chat', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' } });
      return;
    }
    calls += 1;
    const current = calls;
    if (current !== 2) await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({
      status: current === 2 ? 500 : 200, headers: { 'access-control-allow-origin': '*' },
      json: { message: { content: JSON.stringify({ annotations: [
        { message: 'Présente la membrane.', criterionId: 'membrane', placement: { pageNumber: 1, x: 550, y: 320 }, locationConfidence: 'low' },
      ] }) } },
    }).catch(() => undefined);
  });
  await openAnnotationReview(page);
  await page.getByRole('switch', { name: 'Annotations' }).check();
  const panel = page.getByRole('region', { name: 'Annotations de la copie' });
  const generate = panel.getByRole('button', { name: 'Générer', exact: true });
  await generate.click();
  await expect.poll(() => calls).toBe(1);
  await expect(generate).toBeDisabled();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('button', { name: 'Correction', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Attente du modèle local');
  await panel.getByRole('button', { name: 'Arrêter' }).click();
  release();
  await expect(panel.getByRole('status')).toHaveText('Génération interrompue.');
  await expect(panel.getByText('Annotations (0)')).toBeVisible();

  await generate.click();
  await expect(panel.getByRole('alert')).toContainText('HTTP 500');
  await panel.getByRole('button', { name: 'Réessayer' }).click();
  await expect.poll(() => calls).toBe(3);
  release();
  await expect(panel.getByText('1. Présente la membrane.')).toBeVisible();
  await expect(panel.getByText('Sans emplacement · Suggestion IA à valider', { exact: false })).toBeVisible();
  await expect(page.locator('.copy-inline-annotation')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Valider', exact: true }).click();
  await expect(panel.getByText('Suggestion IA à valider', { exact: false })).toHaveCount(0);
  await expect(page.locator('.review-card-result strong')).toHaveText('1 / 2');
});

test('downloads an annotated copy with a teacher appreciation as a PDF', async ({ page }) => {
  await openAnnotationReview(page);
  await page.getByRole('switch', { name: 'Annotations' }).check();
  const annotations = page.getByRole('region', { name: 'Annotations de la copie' });
  await annotations.getByRole('button', { name: 'Ajouter' }).click();
  await annotations.getByRole('button', { name: 'Sans emplacement' }).click();
  await annotations.getByRole('textbox', { name: 'Remarque' }).fill('Bonne observation.');
  await annotations.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.review-source-pane').getByRole('button', { name: 'Exporter la copie annotée' })).toHaveCount(0);
  await page.locator('.copy-review-validation-bar').getByRole('button', { name: 'Exporter la copie annotée' }).click();
  await expect(page.getByRole('dialog', { name: 'Exporter la copie annotée' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Appréciation générale' }).fill('Appréciation de test.');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger le PDF' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('Copie à annoter-corrigee.pdf');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe('%PDF-');
});

test('keeps the source visible and the annotation controls compact on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openAnnotationReview(page);
  const heading = page.locator('.review-source-heading');
  const source = page.locator('.review-source-pages');
  const toggle = page.getByRole('switch', { name: 'Annotations' });
  await toggle.check();
  const toolbar = page.locator('.copy-annotation-toolbar');
  await expect(toolbar).toBeVisible();
  await expect(page.locator('#copy-annotation-list')).toBeHidden();
  const top = await heading.boundingBox();
  const tools = await toolbar.boundingBox();
  const image = await source.boundingBox();
  expect(top).not.toBeNull();
  expect(tools).not.toBeNull();
  expect(image).not.toBeNull();
  expect(tools!.height).toBeLessThan(115);
  expect(image!.y - top!.y).toBeLessThan(200);
  expect(image!.width).toBeGreaterThan(250);
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Générer', exact: true })).toHaveCount(0);
});
