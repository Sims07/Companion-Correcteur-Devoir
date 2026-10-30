import { expect, test } from '@playwright/test';

test('teacher can create and switch between independent local assignments', async ({ page }) => {
  await page.goto('/');
  const currentAssignment = page.locator('.sidebar-assignment-current');
  const title = page.getByLabel('Nom du devoir', { exact: true });
  const rubricTitle = page.getByLabel('Nom du barème');

  await page.getByRole('button', { name: /Définir le devoir/ }).click();
  await title.fill('Biologie cellulaire');
  await page.getByRole('button', { name: /Préparer le barème/ }).click();
  await rubricTitle.fill('Barème cellulaire');
  await currentAssignment.click();
  await expect(page.locator('.sidebar-assignment-item').filter({ hasText: 'Biologie cellulaire' })).toBeVisible();

  await page.getByRole('button', { name: 'Nouveau devoir' }).click();
  await expect(currentAssignment).toContainText('Nouveau devoir');
  await expect(page.getByRole('heading', { name: 'Définir le devoir' })).toBeVisible();
  await page.getByLabel('Description et objectifs pédagogiques').fill('Comprendre les mécanismes de transmission génétique.');
  await page.getByLabel('Niveau scolaire / universitaire').selectOption('Université — Licence 2');
  await page.getByRole('button', { name: /Continuer vers le barème/ }).click();
  await expect(rubricTitle).toHaveValue('Barème à définir');
  await rubricTitle.fill('Barème génétique');
  await page.getByRole('button', { name: /Définir le devoir/ }).click();
  await title.fill('Génétique moléculaire');
  await currentAssignment.click();
  await expect(page.locator('.sidebar-assignment-item').filter({ hasText: 'Génétique moléculaire' })).toBeVisible();

  await page.locator('.sidebar-assignment-item').filter({ hasText: 'Biologie cellulaire' }).click();
  await page.getByRole('button', { name: /Définir le devoir/ }).click();
  await expect(title).toHaveValue('Biologie cellulaire');
  await page.getByRole('button', { name: /Préparer le barème/ }).click();
  await expect(rubricTitle).toHaveValue('Barème cellulaire');

  await currentAssignment.click();
  await page.locator('.sidebar-assignment-item').filter({ hasText: 'Génétique moléculaire' }).click();
  await page.getByRole('button', { name: /Définir le devoir/ }).click();
  await expect(title).toHaveValue('Génétique moléculaire');
  await page.getByRole('button', { name: /Préparer le barème/ }).click();
  await expect(rubricTitle).toHaveValue('Barème génétique');
  await page.getByRole('button', { name: /Définir le devoir/ }).click();
  await expect(page.getByLabel('Description et objectifs pédagogiques')).toHaveValue('Comprendre les mécanismes de transmission génétique.');
  await expect(page.getByLabel('Niveau scolaire / universitaire')).toHaveValue('Université — Licence 2');

  await page.reload();
  await currentAssignment.click();
  await expect(page.locator('.sidebar-assignment-item').filter({ hasText: 'Génétique moléculaire' })).toBeVisible();
  await page.getByRole('button', { name: /Définir le devoir/ }).click();
  await expect(page.getByRole('heading', { name: 'Définir le devoir' })).toBeVisible();
  await expect(title).toHaveValue('Génétique moléculaire');
  await expect(page.getByLabel('Description et objectifs pédagogiques')).toHaveValue('Comprendre les mécanismes de transmission génétique.');
  await expect(page.getByLabel('Niveau scolaire / universitaire')).toHaveValue('Université — Licence 2');
  await page.getByRole('button', { name: /Continuer vers le barème/ }).click();
  await expect(rubricTitle).toHaveValue('Barème génétique');
  await currentAssignment.click();
  await expect(page.locator('.sidebar-assignment-item').filter({ hasText: 'Biologie cellulaire' })).toBeVisible();
  await expect(page.locator('.sidebar-assignment-item').filter({ hasText: 'Génétique moléculaire' })).toBeVisible();
});

test('teacher journey shows one task at a time and keeps Ollama settings tucked away', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: 'Étapes du devoir' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toBeVisible();
  await expect(page.getByText('IA locale à configurer')).toBeVisible();
  await expect(page.getByRole('button', { name: /Configurer maintenant/ })).toBeVisible();
  await expect(page.getByText('Espace enseignant')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Où se trouvent les questions ?' })).toHaveCount(0);

  await page.getByRole('button', { name: /Définir le devoir/ }).click();
  await page.getByLabel('Nom du devoir', { exact: true }).fill('Biologie cellulaire — partiel S1');
  await page.getByRole('button', { name: /Préparer le barème/ }).click();
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toBeVisible();
  await page.getByRole('button', { name: /Configurer maintenant/ }).click();
  await expect(page.getByRole('heading', { name: 'Paramètres de l’IA locale' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Terminé, revenir au devoir' }).click();
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toBeVisible();
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
  await page.locator('.sidebar-assignment-current').click();
  await expect(page.locator('.sidebar-assignment-current')).toContainText('Biologie cellulaire — partiel S1');

  await page.getByRole('button', { name: /Corrections enregistrées/ }).click();
  await expect(page.getByRole('heading', { name: 'Corrections enregistrées' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aucune correction enregistrée pour le moment' })).toBeVisible();
  await page.locator('.archive-empty').getByRole('button', { name: 'Ajouter une copie' }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();

  await page.getByRole('button', { name: 'Évaluation des modèles' }).click();
  await expect(page.getByRole('navigation', { name: 'Étapes du devoir' })).toHaveCount(0);
  await expect(page.getByLabel('Nom de la configuration')).toBeVisible();
  await expect(page.getByLabel('Modèle de lecture des images')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lancer l’expérience' })).toBeDisabled();
});
