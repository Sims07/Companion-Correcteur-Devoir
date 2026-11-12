import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { openCustomTests } from './helpers/evaluation-models.ts';

test('exports data from localhost and restores it without overwriting unrelated existing copies', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.setItem('companion-correcteur:assignment-title:v1', 'Ancien devoir de biologie');
    const request = indexedDB.open('companion-correcteur-devoir', 6);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('model-evaluations', 'readwrite');
      tx.objectStore('model-evaluations').put({
        id: 'radar-backup-e2e', completedAt: '2026-11-12T19:00:00.000Z',
        images: [{ mimeType: 'image/jpeg', base64: 'PRIVATE_RADAR_IMAGE_BACKUP' }],
        results: [{ score: 9 }],
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  await page.getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('button', { name: 'Suivi & diagnostic' }).click();

  const panel = page.getByRole('region', { name: 'Occupation du stockage local' });
  await expect(panel.getByRole('heading', { name: 'Sauvegarde et transfert' })).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Télécharger ma sauvegarde' }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/^compagnon-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await readFile(await file.path(), 'utf8'));
  expect(exported.localStorage['companion-correcteur:assignment-title:v1']).toBe('Ancien devoir de biologie');
  expect(exported.indexedDb.stores['model-evaluations']).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'radar-backup-e2e', images: [{ mimeType: 'image/jpeg', base64: 'PRIVATE_RADAR_IMAGE_BACKUP' }] }),
  ]));

  await page.evaluate(async () => {
    localStorage.removeItem('companion-correcteur:assignment-title:v1');
    const req = indexedDB.open('companion-correcteur-devoir', 6);
    const db = await new Promise<IDBDatabase>((resolve) => { req.onsuccess = () => resolve(req.result); });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('model-evaluations', 'readwrite');
      tx.objectStore('model-evaluations').delete('radar-backup-e2e');
      tx.objectStore('model-evaluations').put({ id: 'radar-already-there', score: 7 });
      tx.oncomplete = () => resolve();
    });
    db.close();
  });

  await panel.locator('#backup-restore-file').setInputFiles({
    name: 'transfert.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(panel.getByText('transfert.json')).toBeVisible();
  await expect(panel.getByText(/Sur une nouvelle PWA/)).toBeVisible();
  await panel.getByRole('button', { name: 'Restaurer la sauvegarde' }).click();
  await expect(panel.getByText(/Restauration terminée : 1 enregistrement/)).toBeVisible();
  const result = await page.evaluate(async () => {
    const req = indexedDB.open('companion-correcteur-devoir', 6);
    const db = await new Promise<IDBDatabase>((resolve) => { req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction('model-evaluations', 'readonly');
    const store = tx.objectStore('model-evaluations');
    const a = store.get('radar-backup-e2e');
    const b = store.get('radar-already-there');
    const data = await new Promise<{ restored: unknown; preserved: unknown }>((resolve) => {
      tx.oncomplete = () => resolve({ restored: a.result, preserved: b.result });
    });
    db.close();
    return { ...data, title: localStorage.getItem('companion-correcteur:assignment-title:v1') };
  });
  expect(result).toMatchObject({
    title: 'Ancien devoir de biologie',
    restored: { images: [{ base64: 'PRIVATE_RADAR_IMAGE_BACKUP' }] },
    preserved: { score: 7 },
  });
  await panel.getByRole('button', { name: 'Recharger l’application' }).click();
  await expect(page.getByRole('button', { name: 'Évaluer les modèles' })).toBeVisible();
});
