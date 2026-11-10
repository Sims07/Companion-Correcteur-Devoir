import { expect, test } from '@playwright/test';

test('shows origin quota and IndexedDB categories without exposing student copies, and opens archive management', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).waitFor();

  await page.evaluate(async () => {
    const request = indexedDB.open('companion-correcteur-devoir', 6);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['model-evaluations','diagnostic-history'], 'readwrite');
      tx.objectStore('model-evaluations').put({
        id:'storage-observability-e2e',
        completedAt:'2026-11-05T19:00:00.000Z',
        assignmentId:'test',assignmentTitle:'Biologie',question:'QUESTIONS_PRIVÉES',
        rubricSnapshot:{ title:'Test',criteria:[] },correctionMode:'integrated',
        images:[{mimeType:'image/jpeg',base64:'E2E_STUDENT_PRIVATE_IMAGE'}],
        subjectImages:[],subjectTranscription:null,
        configurations:[],results:[],stage:'integrated',
      });
      tx.objectStore('diagnostic-history').put({id:'storage-observability-trace',completedAt:'2026-11-05T19:00:00.000Z',raw:'SECRET_MODEL_RESPONSE'});
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });

  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('navigation', { name: 'Navigation des outils IA' }).getByRole('button', { name: /Suivre et diagnostiquer/ }).click();
  await expect(page.getByRole('heading', { name: 'Observabilité' })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Occupation du stockage local' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Quota annoncé par le navigateur')).toBeVisible();
  await expect(panel.getByText('Évaluations de modèles')).toBeVisible();
  await expect(panel.getByText('Traces techniques')).toBeVisible();
  await expect(panel.locator('.storage-breakdown-item')).toHaveCount(7);
  await expect(panel.getByText(/ordres? de grandeur/i)).toBeVisible();
  await expect(page.getByText('E2E_STUDENT_PRIVATE_IMAGE')).toHaveCount(0);
  await expect(page.getByText('SECRET_MODEL_RESPONSE')).toHaveCount(0);
  await expect(page.getByText('QUESTIONS_PRIVÉES')).toHaveCount(0);

  await panel.getByRole('button', { name: 'Actualiser' }).click();
  await expect(panel.getByRole('button', { name: 'Actualiser' })).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Exporter l’inventaire (sans copies)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('compagnon-stockage-inventaire.json');

  await panel.getByRole('button', { name: 'Gérer les évaluations enregistrées' }).click();
  await expect(page.getByRole('heading', { name: 'Historique & comparaison graphique' })).toBeVisible();
});
