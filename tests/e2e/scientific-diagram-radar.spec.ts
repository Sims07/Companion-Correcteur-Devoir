import { expect, test } from '@playwright/test';
import { DIAGRAM_SENSITIVITY_CASES } from '../../src/domain/scientificDiagramSensitivity.ts';
import { SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET } from '../../src/domain/scientificDiagramFixtures.ts';

test('benchmark radar ranks complete scientific candidates and reveals the original evidence after reload', async ({ page }) => {
  const now = '2026-11-10T19:00:00Z';
  const inputs = (['reference', 'arrows', 'semantic', 'graph'] as const).map((protocol, index) => {
    const cases = (protocol === 'reference' ? ['A', 'B', 'C'] : protocol === 'arrows' ? ['D', 'E']
      : DIAGRAM_SENSITIVITY_CASES.map((item) => item.id)).map((caseId) => {
      const gold = protocol === 'reference' ? { 'graphic::quality': 'present' }
        : protocol === 'arrows' ? { [SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET]: caseId === 'D' ? 'present' : 'absent' }
          : DIAGRAM_SENSITIVITY_CASES.find((c) => c.id === caseId)?.gold ?? {};
      const experiments = ['profile-good', 'profile-mixed'].flatMap((profileId) =>
        Array.from({ length: 3 }, (_, rep) => {
          const accurate = profileId === 'profile-good';
          const observed = Object.fromEntries(Object.entries(gold).map(([key, truth]) => [
            key,
            accurate ? truth : (truth === 'absent' ? 'present' : caseId === 'S5' ? 'uncertain' : 'present'),
          ]));
          return {
            profileId, profileName: accurate ? 'Vision témoin' : 'Vision rapide',
            model: accurate ? 'vision-good:4b' : 'vision-fast:4b',
            method: 'direct-image-generative', repetition: rep + 1,
            status: 'success', durationMs: accurate ? 60_000 : 5_000,
            ...(protocol === 'graph' ? { observations: observed } :
              { observations: Object.entries(observed).map(([key, choice]) => ({ key, choice })) }),
          };
        }));
      return { caseId, label: caseId, gold, experiments, ...(protocol === 'semantic' ? { promptMode: 'standard' } : {}) };
    });
    const createdAt = '2026-11-10T' + (12 + index) + ':00:00Z';
    return {
      id: protocol + ':' + createdAt, protocol, state: 'finished', createdAt, savedAt: now,
      title: protocol === 'reference' ? 'Qualité graphique · A/B/C' : protocol === 'arrows' ? 'Sens des flèches · D/E'
        : protocol === 'semantic' ? 'Compréhension biologique · S0–S5' : 'Graphe des relations · S0–S5',
      plannedRepetitions: 3, profiles: ['Vision témoin', 'Vision rapide'], experimentCount: cases.length * 6,
      successfulCount: cases.length * 6, localOnly: true,
      report: {
        format: protocol === 'reference' || protocol === 'arrows' ? 'companion-scientific-diagram-fixture-report'
          : protocol === 'semantic' ? 'companion-scientific-diagram-sensitivity-report'
            : 'companion-scientific-diagram-blind-graph-report',
        createdAt, plannedRepetitions: 3, cases, localOnly: true,
        promptVariant: 'baseline', promptModes: ['standard'],
        statistics: [], summaries: [], experiments: [],
      },
    };
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).waitFor();
  await page.evaluate(async (items) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('companion-correcteur-devoir', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('diagram-lab-archive', 'readwrite');
    for (const item of items) transaction.objectStore('diagram-lab-archive').put(item);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, inputs);

  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' })
    .getByRole('button', { name: /Carnet de résultats/ }).click();

  const journal = page.getByRole('region', { name: 'Carnet des résultats scientifiques' });
  await journal.getByRole('tab', { name: /Radar des candidats/ }).click();
  const radar = journal.getByRole('region', { name: 'Radar des candidats scientifiques' });
  await expect(radar.getByRole('img', { name: /Comparaison radar/ })).toBeVisible();
  await expect(radar.getByRole('region', { name: 'Classement des candidats' }).getByText('2 candidat(s) classable(s)')).toBeVisible();
  await expect(radar.getByText('Vision témoin').first()).toBeVisible();
  await radar.getByRole('group', { name: 'Axe à examiner' }).getByRole('button', { name: 'Sens des flèches' }).click();
  await expect(radar.getByText('Correspondance sur D/E')).toBeVisible();
  await radar.getByRole('button', { name: 'Consulter la campagne' }).first().click();
  await expect(journal.getByRole('group', { name: 'Campagnes enregistrées' }).getByRole('button', { name: /Sens des flèches/ })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' })
    .getByRole('button', { name: /Carnet de résultats/ }).click();
  await page.getByRole('region', { name: 'Carnet des résultats scientifiques' })
    .getByRole('tab', { name: /Radar des candidats/ }).click();
  const reopened = page.getByRole('region', { name: 'Radar des candidats scientifiques' });
  await expect(reopened.getByRole('region', { name: 'Classement des candidats' }).getByText('2 candidat(s) classable(s)')).toBeVisible();
  await reopened.getByLabel('Regrouper les candidats').selectOption('method');
  await expect(reopened.getByText(/aucune mesure de graphe n’est attribuée artificiellement/)).toBeVisible();
});
