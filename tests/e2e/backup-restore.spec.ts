import { readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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


test('a backup restores both biology radar scores when the destination PWA has initialized an empty history', async ({ page }) => {
  const key = 'companion:biology-teacher-radar:v1';
  await page.goto('/');
  await page.evaluate((key) => {
    const rows = ['biology-alpha', 'biology-beta'].flatMap((model) =>
      ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((caseId) => ({
        id: model + ':' + caseId, campaignId: 'migration-' + model,
        model, profileId: model, profile: model,
        provider: 'ollama', method: 'generative', protocol: 'contract', caseId,
        recordedAt: '2026-11-12T19:00:00Z', status: 'success',
        score: 5, referenceScore: 5,
        decisions: Array.from({ length: 10 }, (_, i) => ({
          id: 'biology-criterion-' + i, expected: i < 5 ? 1 : 0, awarded: i < 5 ? 1 : 0,
        })),
      })));
    localStorage.setItem(key, JSON.stringify(rows));
  }, key);
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const home = page.getByRole('region', { name: 'Tableau de bord des radars' });
  await home.getByLabel('Choisir un LLM').selectOption('biology-alpha');
  await expect(home.getByRole('article', { name: 'Biologie' }).locator('.radar-home-score')).toHaveText('100 / 100');

  await openCustomTests(page);
  await page.getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('button', { name: 'Suivi & diagnostic' }).click();
  const panel = page.getByRole('region', { name: 'Occupation du stockage local' });
  const downloaded = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Télécharger ma sauvegarde' }).click();
  const file = await downloaded;
  const backup = JSON.parse(await readFile(await file.path(), 'utf8'));
  expect(JSON.parse(backup.localStorage[key])).toHaveLength(14);

  // New origin: the already mounted App has persisted [] before opening the importer.
  await page.evaluate((key) => localStorage.setItem(key, '[]'), key);
  await page.reload();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe('[]');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  await page.getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('button', { name: 'Suivi & diagnostic' }).click();
  const restoredPanel = page.getByRole('region', { name: 'Occupation du stockage local' });
  await restoredPanel.locator('#backup-restore-file').setInputFiles({
    name: 'backup-with-biology.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(restoredPanel.getByText(/Radar Biologie : 14 observation/)).toBeVisible();
  await restoredPanel.getByRole('button', { name: 'Restaurer la sauvegarde' }).click();
  await expect(restoredPanel.getByText(/Restauration terminée/)).toBeVisible();
  expect(JSON.parse((await page.evaluate((key) => localStorage.getItem(key), key))!)).toHaveLength(14);
  await restoredPanel.getByRole('button', { name: 'Recharger l’application' }).click();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const radars = page.getByRole('region', { name: 'Tableau de bord des radars' });
  const biography = radars.getByRole('article', { name: 'Biologie' });
  for (const model of ['biology-alpha', 'biology-beta']) {
    await radars.getByLabel('Choisir un LLM').selectOption(model);
    await expect(biography.locator('.radar-home-score')).toHaveText('100 / 100');
    await expect(biography).toContainText('5/5 axes');
  }
  const nav = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await nav.getByRole('button', { name: 'Campagnes' }).click();
  const campaigns = page.getByRole('region', { name: 'Campagnes d’évaluation' });
  await expect(campaigns.locator('.campaign-index-item')).toHaveCount(2);
});


test('Chromium imports a large real JSON backup without constructing a whole-file string', async ({ page }) => {
  test.setTimeout(120_000);
  const names = [
    'local-memory', 'local-corrections', 'model-evaluations', 'diagnostic-history',
    'diagram-lab-archive', 'background-corrections', 'background-transcriptions',
  ];
  const stores = Object.fromEntries(names.map((name) => [name, [] as Record<string, unknown>[]]));
  stores['local-corrections'].push({
    id: 'chrome-large-copy', title: 'Copie importée depuis Safari 😄',
    images: [{ base64: 'A'.repeat(17 * 1024 * 1024) }],
  });
  const data = {
    format: 'companion-correcteur-local-backup', version: 1,
    createdAt: '2026-11-12T19:00:00.000Z',
    localStorage: { 'companion-correcteur:assignment-title:v1': 'Sauvegarde originale Mac' },
    indexedDb: { name: 'companion-correcteur-devoir', version: 6, stores },
  };
  const buffer = Buffer.from(JSON.stringify(data));
  expect(buffer.byteLength).toBeGreaterThan(16 * 1024 * 1024);
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  await page.getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('button', { name: 'Suivi & diagnostic' }).click();
  const panel = page.getByRole('region', { name: 'Occupation du stockage local' });
  await panel.locator('#backup-restore-file').setInputFiles({
    name: 'mac-safari-original-20mb.json', mimeType: 'application/json', buffer,
  });
  await expect(panel.getByText('mac-safari-original-20mb.json')).toBeVisible({ timeout: 60_000 });
  await expect(panel.getByText(/1 enregistrement/).first()).toBeVisible();
  // The freshly launched app initializes a default assignment title. The
  // explicit Update mode replaces it with the backup's original settings.
  await panel.getByLabel(/Mettre à jour les éléments de même identifiant/).check();
  page.once('dialog', (dialog) => void dialog.accept());
  await panel.getByRole('button', { name: 'Restaurer la sauvegarde' }).click();
  await expect(panel.getByText(/Restauration terminée/)).toBeVisible({ timeout: 60_000 });
  const restored = await page.evaluate(async () => {
    const req = indexedDB.open('companion-correcteur-devoir', 6);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const data = await new Promise<{ found: boolean; size: number }>((resolve, reject) => {
      const tx = db.transaction('local-corrections', 'readonly');
      const get = tx.objectStore('local-corrections').get('chrome-large-copy');
      get.onsuccess = () => resolve({
        found: !!get.result,
        size: get.result?.images?.[0]?.base64?.length ?? 0,
      });
      get.onerror = () => reject(get.error);
    });
    db.close();
    return { ...data, title: localStorage.getItem('companion-correcteur:assignment-title:v1') };
  });
  expect(restored).toEqual({
    found: true, size: 17 * 1024 * 1024, title: 'Sauvegarde originale Mac',
  });
});

test('Chromium worker restores a 72 MB image-heavy backup and data survives reload', async ({ page }) => {
  test.setTimeout(240_000);
  const filePath = join(tmpdir(), 'companion-backup-chromium-worker-' + process.pid + '.json');
  const image = 'A'.repeat(2 * 1024 * 1024);
  const fileData = JSON.stringify({
    format: 'companion-correcteur-local-backup',
    version: 1,
    createdAt: '2026-11-12T19:00:00.000Z',
    localStorage: { 'companion-correcteur:bulk-restore-test': 'restored-from-file' },
    indexedDb: {
      name: 'companion-correcteur-devoir',
      version: 6,
      stores: {
        'local-memory': [],
        'local-corrections': Array.from({ length: 36 }, (_, i) => ({
          id: 'bulk-copy-' + i, snapshot: { images: [{ base64: image }] },
          updatedAt: '2026-11-12T19:00:00.000Z',
        })),
        'model-evaluations': [],
        'diagnostic-history': [],
        'diagram-lab-archive': [],
        'background-corrections': [],
        'background-transcriptions': [],
      },
    },
  });
  expect(Buffer.byteLength(fileData)).toBeGreaterThan(70 * 1024 * 1024);
  try {
    await writeFile(filePath, fileData);
    await page.goto('/');
    await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
    await openCustomTests(page);
    await page.getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('button', { name: 'Suivi & diagnostic' }).click();
    const panel = page.getByRole('region', { name: 'Occupation du stockage local' });
    await panel.locator('#backup-restore-file').setInputFiles(filePath);
    await expect(panel.getByText(/Analyse terminée/)).toBeVisible({ timeout: 120_000 });
    await expect(panel.getByText(/36 enregistrement\(s\)/)).toBeVisible();
    await panel.getByRole('button', { name: 'Restaurer la sauvegarde' }).click();
    await expect(panel.getByText(/Restauration terminée : 36 enregistrement/))
      .toBeVisible({ timeout: 120_000 });
    await page.reload();
    const restored = await page.evaluate(async () => {
      const request = indexedDB.open('companion-correcteur-devoir', 6);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        const transaction = db.transaction('local-corrections', 'readonly');
        const store = transaction.objectStore('local-corrections');
        const keys = store.getAllKeys();
        const first = store.get('bulk-copy-0');
        const last = store.get('bulk-copy-35');
        return await new Promise<{ count: number; firstLength: number; lastLength: number }>((resolve, reject) => {
          transaction.oncomplete = () => resolve({
            count: keys.result.filter((key) =>
              typeof key === 'string' && key.startsWith('bulk-copy-')).length,
            firstLength: first.result.snapshot.images[0].base64.length,
            lastLength: last.result.snapshot.images[0].base64.length,
          });
          transaction.onerror = () => reject(transaction.error);
        });
      } finally { db.close(); }
    });
    expect(restored).toEqual({
      count: 36, firstLength: image.length, lastLength: image.length,
    });
    expect(await page.evaluate(() =>
      localStorage.getItem('companion-correcteur:bulk-restore-test'))).toBe('restored-from-file');
  } finally {
    await unlink(filePath).catch(() => {});
  }
});

test('a browser reload after an interrupted bulk import shows a persistent warning', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('companion:backup-import-in-progress:v1',
      JSON.stringify({ stage: 'restauration', percent: 50, records: 12 }));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  await page.getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('button', { name: 'Suivi & diagnostic' }).click();
  const panel = page.getByRole('region', { name: 'Occupation du stockage local' });
  await expect(panel.getByRole('alert')).toContainText('interrompue pendant restauration vers 50 %');
  await expect(panel.getByRole('alert')).toContainText('12 enregistrement(s)');
});
