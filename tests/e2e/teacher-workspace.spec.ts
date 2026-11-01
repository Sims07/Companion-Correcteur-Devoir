import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

test('teacher can edit the collapsed assignment and rubric as one Devoir step', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
  await page.locator('.teacher-step-nav .teacher-step').first().click();

  const assignment = page.locator('.assignment-details-collapsible');
  await expect(assignment).toBeVisible();
  await expect(assignment.locator('summary')).toContainText('20 points · 3 critères');
  await expect(assignment.locator('input#assignment-title-main')).toBeHidden();
  await assignment.locator('summary').click();
  await page.getByLabel('Nom du devoir', { exact: true }).fill('Biologie cellulaire — partiel S1');
  await page.getByLabel('Nom du barème (distinct du devoir)').fill('Barème cellulaire');
  await expect(page.getByRole('heading', { name: 'Devoir et barème' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuer vers les copies' }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();

  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  await page.getByRole('button', { name: /Créer un devoir/ }).click();
  await expect(page.locator('.assignment-details-collapsible')).toBeVisible();
  await page.locator('.assignment-details-collapsible > summary').click();
  await page.getByLabel('Nom du devoir', { exact: true }).fill('Génétique moléculaire');
  await page.getByLabel('Description et objectifs pédagogiques').fill('Comprendre les mécanismes de transmission génétique.');
  await page.getByLabel('Niveau scolaire / universitaire').selectOption({ label: 'Université — Licence 2' });
  await expect(page.getByRole('button', { name: 'Continuer vers les copies' })).toBeDisabled();

  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  await page.locator('.assignment-overview-card').filter({ hasText: 'Biologie cellulaire — partiel S1' }).getByRole('button', { name: /Ouvrir le devoir/ }).click();
  await page.locator('.teacher-step-nav .teacher-step').first().click();
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
  await expect(page.getByRole('navigation', { name: 'Étapes du devoir' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
  await expect(page.getByText('IA locale à configurer')).toBeVisible();
  await expect(page.getByRole('button', { name: /Configurer maintenant/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Devoir et barème' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Espace enseignant' })).toHaveCount(0);

  const advanced = page.locator('.copy-advanced-options').first();
  await expect(advanced).not.toHaveAttribute('open', '');
  await expect(page.getByRole('heading', { name: 'Où se trouvent les questions ?' })).toHaveCount(0);
  await advanced.locator('summary').click();
  await expect(page.getByRole('heading', { name: 'Où se trouvent les questions ?' })).toBeVisible();
  await advanced.locator('summary').click();
  await expect(page.getByRole('heading', { name: 'Où se trouvent les questions ?' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Corriger' })).toBeVisible();

  await page.getByRole('button', { name: 'Réglages de l’IA locale' }).click();
  await expect(page.getByRole('heading', { name: 'Paramètres de l’IA locale' })).toBeVisible();
  await expect(page.getByLabel('Adresse du serveur Ollama')).toBeVisible();
  await expect(page.getByLabel('Modèle de lecture des copies')).toBeVisible();
  await expect(page.getByLabel('Modèle d’analyse et de notation')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Terminé, revenir au devoir' }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
  await expect(page.getByLabel('Adresse du serveur Ollama')).toHaveCount(0);

  await page.locator('.teacher-step-nav .teacher-step').first().click();
  await expect(page.locator('.assignment-details-collapsible')).toBeVisible();
  await expect(page.locator('.assignment-details-collapsible')).not.toHaveAttribute('open', '');
  await expect(page.locator('.teacher-step-nav .teacher-step').nth(1)).toBeVisible();
  await expect(page.getByRole('button', { name: /Révision/ })).toBeVisible();

  await page.getByRole('button', { name: /Corrections enregistrées/ }).click();
  await expect(page.getByRole('heading', { name: 'Corrections enregistrées' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aucune correction enregistrée pour le moment' })).toBeVisible();
  await page.locator('.archive-empty').getByRole('button', { name: 'Ajouter une copie' }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();

  await page.getByRole('button', { name: 'Évaluation des modèles' }).click();
  await expect(page.getByRole('navigation', { name: 'Étapes du devoir' })).toHaveCount(0);
  await expect(page.getByLabel('Nom de la configuration')).toBeVisible();
  await expect(page.getByLabel('Modèle de lecture des images')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Évaluer cette configuration' })).toBeDisabled();
});


test('teacher can choose clearly distinct individual and series correction workflows', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  const modeChooser = page.getByRole('region', { name: 'Choisir le mode de correction' });
  await expect(modeChooser).toBeVisible();
  await expect(modeChooser.getByRole('button', { name: /Correction individuelle/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(modeChooser.getByRole('button', { name: /Correction en série/ })).toHaveAttribute('aria-pressed', 'false');

  await expect(page.locator('.copy-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Session de correction en série' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Corriger' })).toBeVisible();

  await modeChooser.getByRole('button', { name: /Correction en série/ }).click();
  const series = page.getByRole('region', { name: 'Session de correction en série' });
  await expect(series).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toHaveCount(0);
  await expect(page.locator('.copy-panel')).toHaveCount(0);
  await expect(series.getByText('Aucune copie dans la session.')).toBeVisible();
  await expect(series.getByRole('heading', { name: 'Copies ajoutées à la session' })).toBeVisible();
  await expect(series.getByText('Traitement séquentiel')).toBeVisible();
  const automaticRotation = series.getByRole('checkbox', { name: /Rotation automatique des schémas/ });
  await expect(automaticRotation).toBeVisible();
  await expect(automaticRotation).not.toBeChecked();
  await automaticRotation.check();
  await expect(automaticRotation).toBeChecked();
  await expect(modeChooser.getByRole('button', { name: /Correction en série/ })).toHaveAttribute('aria-pressed', 'true');

  await modeChooser.getByRole('button', { name: /Correction individuelle/ }).click();
  await expect(page.locator('.copy-panel')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Session de correction en série' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Corriger' })).toBeVisible();
});


test('series mode groups several selected pages into one copy or keeps one file per copy', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  const modeChooser = page.getByRole('region', { name: 'Choisir le mode de correction' });
  await modeChooser.getByRole('button', { name: /Correction en série/ }).click();
  const series = page.getByRole('region', { name: 'Session de correction en série' });

  await expect(series.getByRole('radio', { name: /Un fichier = une copie/ })).toBeChecked();
  await expect(series.getByRole('radio', { name: /Regrouper les fichiers dans une copie/ })).toBeVisible();
  await series.getByRole('radio', { name: /Regrouper les fichiers dans une copie/ }).check();
  await expect(series.getByRole('button', { name: 'Ajouter cette copie' })).toBeVisible();
  await expect(series.getByText(/Chaque sélection constitue une nouvelle copie/)).toBeVisible();

  await series.getByRole('radio', { name: /Un fichier = une copie/ }).check();
  await expect(series.getByRole('button', { name: 'Ajouter les copies' })).toBeVisible();
  await expect(series.getByText(/Un fichier sélectionné correspond à une copie/)).toBeVisible();
});


test('series session previews added pages, resets the picker and allows removing a queued copy', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  const chooser = page.getByRole('region', { name: 'Choisir le mode de correction' });
  await chooser.getByRole('button', { name: /Correction en série/ }).click();
  const series = page.getByRole('region', { name: 'Session de correction en série' });
  await series.getByRole('radio', { name: /Regrouper les fichiers dans une copie/ }).check();
  await series.getByLabel('Démarrer automatiquement la correction').uncheck();

  await expect(series.getByText('Aucune copie dans la session.')).toBeVisible();
  const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=', 'base64');
  await series.locator('#series-copy-files').setInputFiles([
    { name: 'page-1.png', mimeType: 'image/png', buffer: onePixelPng },
    { name: 'page-2.png', mimeType: 'image/png', buffer: onePixelPng },
  ]);

  await expect(series.getByRole('heading', { name: 'Copies ajoutées à la session' })).toBeVisible();
  await expect(series.getByText('Copie 1')).toBeVisible();
  await expect(series.getByText('2 page(s) · En attente')).toBeVisible();
  await expect(series.locator('.correction-series-actions')).toBeVisible();
  const identity = series.locator('.correction-series-copy-top');
  const actionRow = series.locator('.correction-series-actions');
  const identityBox = await identity.boundingBox();
  const actionsBox = await actionRow.boundingBox();
  expect(identityBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(actionsBox!.y).toBeGreaterThanOrEqual(identityBox!.y + identityBox!.height - 1);

  await series.getByRole('button', { name: 'Voir les pages et la correction' }).click();
  await expect(series.getByRole('img', { name: 'Page 1 de Copie 1' })).toBeVisible();
  await expect(series.getByRole('img', { name: 'Page 2 de Copie 1' })).toBeVisible();
  await expect(series.locator('.file-picker-selected')).toHaveCount(0);
  await expect(series.getByRole('button', { name: 'Démarrer les corrections (1)' })).toBeVisible();

  const correctionDetails = series.getByRole('region', { name: 'Correction de Copie 1' });
  await expect(correctionDetails).toBeVisible();
  await expect(correctionDetails.getByText('La correction démarrera dès que cette copie sera prise en charge.')).toBeVisible();
  await expect(series.getByRole('button', { name: 'Masquer les pages et la correction' })).toHaveAttribute('aria-expanded', 'true');

  page.once('dialog', (dialog) => dialog.accept());
  await series.getByRole('button', { name: 'Supprimer' }).click();
  await expect(series.getByText('Aucune copie dans la session.')).toBeVisible();
  await expect(series.getByRole('button', { name: 'Démarrer les corrections (1)' })).toHaveCount(0);
});
