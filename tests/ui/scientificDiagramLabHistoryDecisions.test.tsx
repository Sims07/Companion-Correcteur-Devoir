import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportDetails } from '../../src/ui/components/ScientificDiagramLabHistory.tsx';
import { SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC } from '../../src/domain/scientificDiagramFixtures.ts';
import type { DiagramLabArchiveEntry } from '../../src/domain/diagramLabHistory.ts';

describe('scientific diagram fixture history', () => {
  it('makes the two errors of image E obvious while leaving the other 17 decisions green', () => {
    const decisions = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.flatMap((criterion) =>
      (criterion.subcriteria ?? []).map((sub) => {
        const key = criterion.id + '::' + sub.id;
        const incorrect = key === 'legends::legends-aligned' || key === 'legends::legends-visible';
        return { key, reference: incorrect ? 'absent' : 'present', choices: ['present'] };
      }));
    expect(decisions).toHaveLength(19);
    const entry = {
      report: {
        format: 'companion-scientific-diagram-fixture-report',
        limitations: 'Provisional references',
        cases: [{
          caseId: 'E', label: 'E — piège, flèches inversées', referenceScore: 8.66,
          experiments: [{}],
          layoutObservation: { reason: 'Les légendes sont disposées en lignes sous les cellules.' },
          labelPointerChallenge: {
            expected: 'incorrect',
            descriptions: ['Chromosomes pointe le fuseau et Fuseau mitotique pointe les chromosomes.'],
          },
          summaries: [{
            profileId: 'gemma', profileName: 'Gemma', model: 'gemma4:12b', method: 'direct-image-generative',
            accuracyPercent: 89.5, resolvedDecisions: 19, totalDecisions: 19,
            stableResolvedTargets: null, totalTargets: 19, meanDurationMs: 469000,
            decisions,
          }],
        }],
      },
    } as unknown as DiagramLabArchiveEntry;
    const html = renderToStaticMarkup(<ReportDetails entry={entry} />);
    expect(html).toContain('17/19 critères conformes');
    expect(html).toContain('2 écart(s)');
    expect(html).toContain('Critère non respecté');
    expect(html).toContain('Critère respecté');
    expect(html.match(/Statut : Conforme/g)).toHaveLength(17);
    expect(html.match(/Statut : Écart/g)).toHaveLength(2);
    expect(html).toContain('Alignées en colonne');
    expect(html).toContain('Légendes : structures visibles et flèches correctes');
    expect(html).toContain('Les légendes sont visibles, mais quatre traits pointent vers une autre structure');
    expect(html).toContain('Agrandir : Schéma de référence E');
    expect(html).toContain('Voir uniquement les écarts');
  });
});
