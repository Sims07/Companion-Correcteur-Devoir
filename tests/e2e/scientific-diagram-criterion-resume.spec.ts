import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

test('reopens a partial diagram and retries only the ungraded criterion', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  await page.evaluate(async () => {
    const rubric = { title: 'Schéma de cellule', criteria: [
      { id: 'title', title: 'Titre principal', description: 'Titre visible.', maxPoints: 2, analysisMode: 'scientific-diagram' },
      { id: 'labels', title: 'Légendes', description: 'Structures identifiées.', maxPoints: 2, analysisMode: 'scientific-diagram' },
    ] };
    localStorage.setItem('companion-correcteur:assignments:v1', JSON.stringify([{
      id: 'assignment-default', title: rubric.title, question: 'Dessiner une cellule.',
      correctionMode: 'integrated', kind: 'scientific-diagram', rubric,
    }]));
    localStorage.setItem('companion-correcteur:active-assignment:v1', 'assignment-default');
    localStorage.setItem('companion-correcteur:auto-background-correction:v1', 'false');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'http://127.0.0.1:11434', generativeModel: 'analysis', correctionMethod: 'generative',
    }));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('companion-correcteur-devoir', 7);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const criterion = { criterionId: 'title', points: 1, evidence: 'Titre visible.', rationale: 'Titre incomplet.', confidence: 'high' };
    const image = { mimeType: 'image/png', fileName: 'schema.png',
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQ6dH4DwADIAAIQANK2lVBAAAAAElFTkSuQmCC' };
    const tx = db.transaction('background-corrections', 'readwrite');
    tx.objectStore('background-corrections').put({
      id: 'diagram-to-retry', assignmentId: 'assignment-default', label: 'Schéma à reprendre',
      rubric, question: 'Dessiner une cellule.', correctionMode: 'integrated', gradingFlow: 'scientific-diagram-direct',
      correctionMethod: 'generative', criterionByCriterion: true, analysisModel: 'analysis', visionModel: '',
      images: [image], originalImages: [image], subjectImages: [], detectTeacherAnnotations: false,
      annotationInkColor: 'none', annotationInkColorApplied: true, thinking: false,
      status: 'needs-review', phase: 'complete', completedCriteria: 1, totalCriteria: 2, completedPages: 1,
      createdAt: '2026-11-25T09:00:00.000Z', updatedAt: '2026-11-25T09:00:00.000Z',
      partialCriteria: [criterion], transcription: null, imageFingerprint: 'fixture-diagram',
      proposal: { summary: '', criteria: [criterion], questionsForTeacher: [], finalScore: 1, scoreIncomplete: true },
      error: 'Un critère reste à évaluer.',
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

  let finish!: () => void;
  const responsePending = new Promise<void>(resolve => { finish = resolve; });
  const scoredCriteria: string[][] = [];
  await page.route('http://127.0.0.1:11434/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = {
      'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/tags') return route.fulfill({ headers, json: { models: [{ name: 'analysis' }] } });
    if (path === '/api/chat') {
      const payload = request.postDataJSON();
      if (payload.format?.properties?.criteria) {
        scoredCriteria.push(Object.keys(payload.format.properties.criteria.properties));
        await responsePending;
        const content = JSON.stringify({ criteria: { labels: {
          points: 2, confidence: 'high', evidence: 'Membrane et noyau légendés.', questionForTeacher: '',
        } } });
        return route.fulfill({ headers, body: JSON.stringify({ message: { content }, done: true }) + '\n' });
      }
    }
    return route.fulfill({ headers, json: {} });
  });

  await page.reload();
  await openActiveAssignment(page);
  const copies = page.getByRole('tab', { name: /Copies/ });
  const card = page.locator('.copy-overview-grid .correction-series-card').filter({ hasText: 'Schéma à reprendre' });
  await copies.click();
  await page.locator('.copy-overview-filters').getByRole('button', { name: /À vérifier/ }).click();
  await card.getByRole('button', { name: 'Vérifier la copie' }).click();
  const validate = page.getByRole('button', { name: 'Valider et passer à la suivante' });
  await expect(validate).toBeDisabled();
  await expect(page.getByText('Note partielle · analyse incomplète')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Relancer le critère Légendes' });
  await retry.click();
  try {
    await expect(page.getByRole('heading', { name: 'Correction du schéma en cours' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Arrêter cette correction' })).toBeVisible();
    await copies.click();
    await page.getByRole('button', { name: /Copie en cours.*Schéma à reprendre/ }).click();
    await expect(page.getByRole('heading', { name: 'Correction du schéma en cours' })).toBeVisible();
  } finally {
    finish();
  }
  await expect(validate).toBeEnabled();
  await expect(page.locator('.copy-review-validation-bar strong')).toHaveText('3 / 4');
  expect(scoredCriteria).toEqual([['labels']]);
});
