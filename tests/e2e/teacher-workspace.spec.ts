import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

test('teacher can edit the collapsed assignment and rubric as one Devoir step', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
  await page.getByRole('tab', { name: 'Barème' }).click();

  const assignment = page.locator('.assignment-details-collapsible');
  await expect(assignment).toBeVisible();
  await expect(assignment.locator('summary')).toContainText('20 points · 3 critères');
  await expect(assignment.locator('input#assignment-title-main')).toBeHidden();
  await assignment.locator('summary').click();
  await page.getByLabel('Nom du devoir', { exact: true }).fill('Biologie cellulaire — partiel S1');
  await page.getByLabel('Nom du barème (distinct du devoir)').fill('Barème cellulaire');
  await expect(page.getByRole('heading', { name: 'Devoir et barème' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuer vers les copies' }).click();
  await expect(page.getByRole('heading', { name: 'Suivi des copies' })).toBeVisible();

  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  await page.getByRole('button', { name: /Créer un devoir/ }).click();
  await expect(page.getByRole('heading', { name: 'Préparer une évaluation' })).toBeVisible();
  await page.getByLabel(/Nom du devoir/).fill('Génétique moléculaire');
  await page.getByLabel('Objectif pédagogique').fill('Comprendre les mécanismes de transmission génétique.');
  await page.getByLabel('Niveau', { exact: true }).selectOption({ label: 'Université — Licence 2' });
  await page.getByRole('button', { name: /Créer et préparer le barème/ }).click();
  await expect(page.getByRole('button', { name: 'Continuer vers les copies' })).toBeDisabled();

  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  await page.locator('.assignment-overview-card').filter({ hasText: 'Biologie cellulaire — partiel S1' }).getByRole('button', { name: /Ouvrir le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  await expect(page.getByLabel('Nom du barème (distinct du devoir)')).toHaveValue('Barème cellulaire');
  await page.locator('.assignment-details-collapsible > summary').click();
  await expect(page.getByLabel('Nom du devoir', { exact: true })).toHaveValue('Biologie cellulaire — partiel S1');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
  await expect(page.locator('.assignment-overview-card').filter({ hasText: 'Génétique moléculaire' })).toBeVisible();
});

test('the teacher journey starts with Copies, keeps advanced options collapsed and isolates AI settings', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  await expect(page.getByRole('tablist', { name: 'Sections du devoir' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Copies' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
  await expect(page.getByText('IA locale à configurer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'IA locale à configurer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Devoir et barème' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Espace enseignant' })).toHaveCount(0);

  const advanced = page.locator('.copy-advanced-options').first();
  await expect(advanced).not.toHaveAttribute('open', '');
  await expect(page.getByRole('heading', { name: 'Où se trouvent les questions ?' })).toHaveCount(0);
  await advanced.locator('summary').click();
  await expect(page.getByRole('heading', { name: 'Où se trouvent les questions ?' })).toBeVisible();
  await advanced.locator('summary').click();
  await expect(page.getByRole('heading', { name: 'Où se trouvent les questions ?' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Corriger', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'IA locale à configurer' }).click();
  await expect(page.getByRole('heading', { name: 'Paramètres de l’IA locale' })).toBeVisible();
  await expect(page.getByLabel('Adresse du serveur Ollama')).toBeVisible();
  await expect(page.getByLabel('Modèle de lecture des copies')).toBeVisible();
  await expect(page.getByLabel('Modèle d’analyse et de notation')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Terminé, revenir au devoir' }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
  await expect(page.getByLabel('Adresse du serveur Ollama')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Barème' }).click();
  await expect(page.locator('.assignment-details-collapsible')).toBeVisible();
  await expect(page.locator('.assignment-details-collapsible')).not.toHaveAttribute('open', '');
  await expect(page.getByRole('tab', { name: 'Copies' })).toBeVisible();
  await expect(page.locator('.teacher-step-nav')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Copies' }).click();
  await page.locator('.copy-overview-filters').getByRole('button', { name: /Corrigées/ }).click();
  await expect(page.getByRole('heading', { name: 'Suivi des copies' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Corrigées/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Aucune copie pour le moment')).toBeVisible();
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter une copie/ }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();

  await page.getByRole('button', { name: 'Évaluation des modèles' }).click();
  await expect(page.getByRole('tablist', { name: 'Sections du devoir' })).toHaveCount(0);
  await expect(page.getByLabel('Nom de la configuration')).toBeVisible();
  await expect(page.getByLabel('Modèle de lecture des images')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Évaluer cette configuration' })).toBeDisabled();
});


test('individual correction checks both local Ollama models before its first inference request', async ({ page }) => {
  const requests: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'http://localhost:11434',
      apiCompatible: false,
      visionModel: 'vision:4b',
      analysisModel: 'analysis:4b',
    }));
  });
  await page.route('http://localhost:11434/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/tags') {
      requests.push('tags');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'vision:4b' }, { name: 'analysis:4b' }] }) });
      return;
    }
    if (url.pathname === '/api/show') {
      const model = route.request().postDataJSON()?.model as string;
      requests.push(`show:${model}`);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modelfile: `FROM ${model}` }) });
      return;
    }
    if (url.pathname === '/api/chat') {
      const payload = route.request().postDataJSON() as { model: string; stream: boolean };
      requests.push(`${payload.stream ? 'inference' : 'prewarm'}:${payload.model}`);
      if (!payload.stream) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: { content: 'OK' } }) });
        return;
      }
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'fake inference failure' }) });
      return;
    }
    await route.fulfill({ status: 404, body: 'not found' });
  });

  await page.goto('/');
  await openActiveAssignment(page);
  const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=', 'base64');
  await page.locator('#copy-files').setInputFiles({ name: 'copie-test.png', mimeType: 'image/png', buffer: onePixelPng });
  await expect.poll(() => requests.includes('prewarm:vision:4b')).toBe(true);

  const beforeCorrection = requests.length;
  await page.getByRole('button', { name: 'Corriger', exact: true }).click();
  await expect.poll(() => requests.slice(beforeCorrection).some((item) => item.startsWith('inference:'))).toBe(true);

  expect(requests.slice(beforeCorrection, beforeCorrection + 4)).toEqual([
    'tags',
    'show:vision:4b',
    'tags',
    'show:analysis:4b',
  ]);
  expect(requests.slice(beforeCorrection).findIndex((item) => item.startsWith('inference:'))).toBeGreaterThan(3);
  await expect(page.getByText(/fake inference failure|HTTP 500/)).toBeVisible();
});

test('teacher can choose clearly distinct individual and series correction workflows', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  const modeChooser = page.getByRole('region', { name: 'Choisir le mode de correction' });
  await expect(modeChooser).toBeVisible();
  await expect(modeChooser.getByRole('button', { name: /Correction individuelle/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(modeChooser.getByRole('button', { name: /Corriger plusieurs copies/ })).toHaveAttribute('aria-pressed', 'false');

  await expect(page.locator('.copy-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Copies du devoir' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Corriger', exact: true })).toBeVisible();

  await modeChooser.getByRole('button', { name: /Corriger plusieurs copies/ }).click();
  const series = page.getByRole('region', { name: 'Copies du devoir' });
  await expect(series).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toHaveCount(0);
  await expect(page.locator('.copy-panel')).toHaveCount(0);
  await expect(series.getByText('Aucune copie dans la session.')).toBeVisible();
  await expect(series.getByRole('heading', { name: 'Copies à corriger' })).toBeVisible();
  await expect(series.getByText('Correction des copies')).toBeVisible();
  const automaticRotation = series.getByRole('checkbox', { name: /Rotation automatique des schémas/ });
  await expect(automaticRotation).toBeVisible();
  await expect(automaticRotation).not.toBeChecked();
  await automaticRotation.check();
  await expect(automaticRotation).toBeChecked();
  await expect(modeChooser.getByRole('button', { name: /Corriger plusieurs copies/ })).toHaveAttribute('aria-pressed', 'true');

  await modeChooser.getByRole('button', { name: /Correction individuelle/ }).click();
  await expect(page.locator('.copy-panel')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Copies du devoir' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Corriger', exact: true })).toBeVisible();
});


test('series mode groups several selected pages into one copy or keeps one file per copy', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  const modeChooser = page.getByRole('region', { name: 'Choisir le mode de correction' });
  await modeChooser.getByRole('button', { name: /Corriger plusieurs copies/ }).click();
  const series = page.getByRole('region', { name: 'Copies du devoir' });

  await expect(series.getByRole('radio', { name: /Un fichier = une copie/ })).toBeChecked();
  await expect(series.getByRole('radio', { name: /Regrouper les fichiers dans une copie/ })).toBeVisible();
  await series.getByRole('radio', { name: /Regrouper les fichiers dans une copie/ }).check();
  await expect(series.getByRole('button', { name: 'Ajouter cette copie' })).toBeVisible();
  await expect(series.getByText(/Chaque sélection constitue une nouvelle copie/)).toBeVisible();

  await series.getByRole('radio', { name: /Un fichier = une copie/ }).check();
  await expect(series.getByRole('button', { name: 'Ajouter les copies' })).toBeVisible();
  await expect(series.getByText(/Un fichier sélectionné correspond à une copie/)).toBeVisible();
});


test('series session keeps copy cards uniform and opens the correction separately', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  const chooser = page.getByRole('region', { name: 'Choisir le mode de correction' });
  await chooser.getByRole('button', { name: /Corriger plusieurs copies/ }).click();
  const series = page.getByRole('region', { name: 'Copies du devoir' });
  await series.getByRole('radio', { name: /Un fichier = une copie/ }).check();
  await series.getByLabel('Démarrer automatiquement la correction').uncheck();

  const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=', 'base64');
  await series.locator('#series-copy-files').setInputFiles([
    { name: 'copie-a.png', mimeType: 'image/png', buffer: onePixelPng },
    { name: 'copie-b.png', mimeType: 'image/png', buffer: onePixelPng },
  ]);
  await expect(series.getByRole('heading', { name: 'Copies à corriger' })).toBeVisible();

  const cards = series.locator('.correction-series-card');
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    await expect(card.getByText('Note à venir')).toBeVisible();
    await expect(card.getByText('À corriger')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Voir les pages et la correction' })).toHaveCount(0);
    await expect(card.locator('.correction-series-pages')).toHaveCount(0);
    await expect(card.locator('.correction-series-live-details')).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Supprimer' })).toBeVisible();
  }
  const firstBox = await cards.nth(0).boundingBox();
  const secondBox = await cards.nth(1).boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  expect(Math.abs(firstBox!.height - secondBox!.height)).toBeLessThanOrEqual(1);
  await expect(series.getByRole('button', { name: 'Démarrer les corrections (2)' })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await cards.nth(0).getByRole('button', { name: 'Supprimer' }).click();
  await expect(cards).toHaveCount(1);
  await expect(series.getByRole('button', { name: 'Démarrer les corrections (2)' })).toHaveCount(0);
});
