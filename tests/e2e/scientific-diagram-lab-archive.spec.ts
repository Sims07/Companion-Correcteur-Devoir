import { expect, test } from '@playwright/test';
import { buildBlindVisualObservationReport } from '../../src/domain/scientificDiagramBlindGraph.ts';

test('an existing exported scientific diagram report is readable tomorrow without rerunning models', async ({ page }) => {
  const report = buildBlindVisualObservationReport([], 1, '2026-11-09T09:00:00.000Z', 'isolated-arrows-outside');
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' })
    .getByRole('button', { name: /Campagnes/ }).click();
  await page.getByRole('button', { name: 'Archives scientifiques' }).click();

  const journal = page.getByRole('region', { name: 'Campagnes de test scientifiques' });
  await expect(journal.getByText('Aucun résultat pour ce filtre')).toBeVisible();
  await journal.getByRole('button', { name: 'Importer un ancien JSON' }).click();
  await journal.getByLabel('Choisir un ancien rapport JSON').setInputFiles({
    name: 'companion-graphe-visuel.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(report)),
  });
  await expect(journal.getByText('Ancien rapport ajouté aux campagnes de test locales.')).toBeVisible();
  await expect(journal.getByRole('group', { name: 'Campagnes enregistrées' })
    .getByRole('button', { name: /Graphe des relations/ })).toBeVisible();
  await expect(journal.getByRole('heading', { name: 'Examiner les six dessins' })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' })
    .getByRole('button', { name: /Campagnes/ }).click();
  await page.getByRole('button', { name: 'Archives scientifiques' }).click();
  const restored = page.getByRole('region', { name: 'Campagnes de test scientifiques' });
  await expect(restored.getByRole('group', { name: 'Campagnes enregistrées' })
    .getByRole('button', { name: /Graphe des relations/ })).toBeVisible();
  await restored.getByRole('button', { name: 'Exporter JSON' }).click();
  // No model endpoint was needed for importing, reading or exporting this report.
});
