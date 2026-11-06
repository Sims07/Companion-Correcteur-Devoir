import { expect, test } from '@playwright/test';

test('the guided biology protocol provisions three local profiles and runs independently from the teacher rubric', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();

  const panel = page.getByRole('region', { name: 'Protocole de test guidé' });
  await expect(panel.getByRole('heading', { name: 'Protocole de test — 3 copies de biologie' })).toBeVisible();
  const assignmentsBefore = await page.evaluate(() => localStorage.getItem('companion-correcteur:assignments:v1'));
  await panel.getByRole('button', { name: 'Préparer le protocole en un clic' }).click();

  await expect(panel.getByText('A — correcte')).toBeVisible();
  await expect(panel.getByText('B — inversions')).toBeVisible();
  await expect(panel.getByText('C — partielle')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Lancer les 3 analyses (sans image)' })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Tester les 3 photos (Vision + analyse)' })).toBeDisabled();
  await expect(panel.getByText('3 profil(s) sélectionné(s)', { exact: false })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Type d’évaluation' })
    .getByRole('button', { name: /Analyse seule/ })).toHaveAttribute('aria-pressed', 'true');

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('companion-correcteur:ollama-profiles:v1');
    return raw ? JSON.parse(raw) as Array<{
      id: string; configuration: { apiCompatible: boolean; apiKey: string; endpoint: string; correctionMethod: string };
    }> : [];
  });
  const profiles = stored.filter((profile) => profile.id.startsWith('pilot-biology-'));
  expect(profiles).toHaveLength(3);
  expect(profiles.map((profile) => profile.configuration.correctionMethod)).toEqual(['generative', 'decision', 'decision']);
  expect(profiles.every((profile) => profile.configuration.apiCompatible === false &&
    profile.configuration.apiKey === '' && profile.configuration.endpoint === 'http://localhost:11434')).toBe(true);

  // The pilot is isolated: the main teacher/editor rubric remains the original example.
  const assignmentsAfter = await page.evaluate(() => localStorage.getItem('companion-correcteur:assignments:v1'));
  expect(assignmentsAfter).toBe(assignmentsBefore);
});
