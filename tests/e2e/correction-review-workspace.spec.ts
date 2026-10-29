import { expect, test } from '@playwright/test';

test('review workspace keeps original evidence beside grading criteria on desktop and stacks on mobile', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(async () => {
    const request = indexedDB.open('companion-correcteur-devoir', 2);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('local-memory')) {
          const memory = db.createObjectStore('local-memory', { keyPath: 'id' });
          memory.createIndex('correctionId', 'correctionId', { unique: false });
          memory.createIndex('rubricFingerprint', 'rubricFingerprint', { unique: false });
          memory.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('local-corrections')) {
          const corrections = db.createObjectStore('local-corrections', { keyPath: 'id' });
          corrections.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
    });
    const transaction = database.transaction('local-corrections', 'readwrite');
    transaction.objectStore('local-corrections').put({
      id: 'design-review-copy',
      label: 'Copie de test',
      rubricTitle: 'Barème de membrane',
      rubricFingerprint: 'rubric-design-test',
      createdAt: '2026-10-29T08:00:00.000Z',
      updatedAt: '2026-10-29T08:00:00.000Z',
      assignmentTitle: 'Biologie cellulaire',
      snapshot: {
        assignmentTitle: 'Biologie cellulaire',
        question: 'Expliquez le rôle de la membrane plasmique.',
        rubric: {
          title: 'Barème de membrane',
          criteria: [{ id: 'membrane', title: 'Rôle de la membrane', description: 'Expliquer la barrière sélective.', maxPoints: 4 }],
        },
        proposal: {
          summary: 'La réponse mentionne la membrane mais manque de précision.',
          criteria: [{ criterionId: 'membrane', points: 2, rationale: 'Le mécanisme est partiellement expliqué.', evidence: 'La réponse mentionne la membrane.', confidence: 'medium' }],
          questionsForTeacher: [],
          finalScore: 2,
        },
        review: [{ criterionId: 'membrane', points: 2, rationale: 'Le mécanisme est partiellement expliqué.', evidence: 'La réponse mentionne la membrane.', confidence: 'medium', teacherPoints: 2, teacherComment: '', decision: 'pending' }],
        teacherQuestions: '',
        images: [{ base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/9ioAAAAASUVORK5CYII=', mimeType: 'image/png', fileName: 'page-1.png' }],
        transcription: 'La membrane plasmique constitue une barrière sélective.',
        subjectImages: [],
        subjectTranscription: null,
        correctionMode: 'integrated',
        maximumPoints: 4,
      },
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });

  await page.reload();
  await page.getByRole('button', { name: /Corrections enregistrées/ }).click();
  await page.getByRole('button', { name: 'Consulter la correction' }).click();

  await expect(page.getByRole('complementary', { name: 'Copie de référence' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rôle de la membrane' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Page originale 1 de la copie' })).toBeVisible();
  await expect(page.getByText('Texte reconnu par l’IA')).toBeVisible();

  const sourcePane = page.locator('.review-source-pane');
  await expect(sourcePane).toHaveCSS('position', 'sticky');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sourcePane).toHaveCSS('position', 'static');
  await expect(page.locator('.review-workspace')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rôle de la membrane' })).toBeVisible();
});
