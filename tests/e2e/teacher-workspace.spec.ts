import { expect, test } from '@playwright/test';

test('teacher can create and switch between independent local assignments', async ({ page }) => {
  await page.goto('/');
  const title = page.getByLabel('DEVOIR EN COURS');
  await title.fill('Biologie cellulaire');
  const rubricTitle = page.getByLabel('Nom du barème');
  await rubricTitle.fill('Barème cellulaire');
  await expect(page.getByRole('button', { name: /Biologie cellulaire/ })).toBeVisible();

  await page.getByRole('button', { name: 'Nouveau devoir' }).click();
  await expect(title).toHaveValue('Nouveau devoir');
  await expect(rubricTitle).toHaveValue('Barème de biologie — exemple');
  await rubricTitle.fill('Barème génétique');
  await title.fill('Génétique moléculaire');
  await expect(page.getByRole('button', { name: /Génétique moléculaire/ })).toBeVisible();

  await page.getByRole('button', { name: /Biologie cellulaire/ }).click();
  await expect(title).toHaveValue('Biologie cellulaire');
  await expect(rubricTitle).toHaveValue('Barème cellulaire');
  await page.getByRole('button', { name: /Génétique moléculaire/ }).click();
  await expect(title).toHaveValue('Génétique moléculaire');
  await expect(rubricTitle).toHaveValue('Barème génétique');

  await page.reload();
  await expect(title).toHaveValue('Génétique moléculaire');
  await expect(page.getByRole('button', { name: /Biologie cellulaire/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Génétique moléculaire/ })).toBeVisible();
});

test('teacher journey shows one task at a time and keeps Ollama settings tucked away', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: 'Étapes du devoir' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Préparer le barème' })).toBeVisible();
  await expect(page.getByText('IA locale à configurer')).toBeVisible();
  await expect(page.getByRole('button', { name: /Configurer maintenant/ })).toBeVisible();
  await expect(page.getByText('Espace enseignant')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Où se trouvent les questions ?' })).toHaveCount(0);
  const assignmentTitle = page.getByLabel('DEVOIR EN COURS');
  await assignmentTitle.fill('Biologie cellulaire — partiel S1');
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toHaveCount(0);
  await page.getByRole('button', { name: /Configurer maintenant/ }).click();
  await expect(page.getByRole('heading', { name: 'Paramètres de l’IA locale' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Préparer le barème' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Terminé, revenir au devoir' }).click();
  await expect(page.getByRole('heading', { name: 'Préparer le barème' })).toBeVisible();
  await expect(page.getByLabel('Adresse du serveur Ollama')).toHaveCount(0);

  await page.getByRole('button', { name: /Continuer vers la copie/ }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Où se trouvent les questions ?' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Copie de l’étudiant' })).toBeVisible();
  await expect(page.locator('.correction-mode-panel .number')).toHaveCount(0);
  await expect(page.locator('.copy-panel .number')).toHaveCount(0);
  await expect(page.getByLabel('Adresse du serveur Ollama')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Réglages de l’IA locale/ })).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: 'Réglages de l’IA locale' }).click();
  await expect(page.getByRole('heading', { name: 'Paramètres de l’IA locale' })).toBeVisible();
  await expect(page.getByLabel('Adresse du serveur Ollama')).toBeVisible();
  await expect(page.getByLabel('Modèle de lecture des copies')).toBeVisible();
  await expect(page.getByLabel('Modèle d’analyse et de notation')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Copie de l’étudiant' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lancer la lecture et la correction' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Terminé, revenir au devoir' }).click();
  await expect(page.getByLabel('Adresse du serveur Ollama')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();

  await page.getByRole('button', { name: 'Réglages de l’IA locale' }).click();
  await expect(page.getByRole('heading', { name: 'Paramètres de l’IA locale' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Terminé, revenir au devoir' }).click();

  await page.reload();
  await expect(page.getByLabel('DEVOIR EN COURS')).toHaveValue('Biologie cellulaire — partiel S1');

  await page.getByRole('button', { name: /Corrections enregistrées/ }).click();
  await expect(page.getByRole('heading', { name: 'Corrections enregistrées' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aucune correction enregistrée pour le moment' })).toBeVisible();
  await page.locator('.archive-empty').getByRole('button', { name: 'Ajouter une copie' }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();

  await page.getByRole('button', { name: 'Diagnostic IA' }).click();
  await expect(page.getByRole('navigation', { name: 'Étapes du devoir' })).toHaveCount(0);
  await expect(page.getByLabel('Stratégie de comparaison')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lire puis analyser les copies' })).toBeDisabled();
});
