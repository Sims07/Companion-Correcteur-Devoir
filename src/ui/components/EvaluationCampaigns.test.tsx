import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BiologyRadarObservation } from '../../domain/biologyTeacherRadar.ts';
import type { DiagramLabArchiveEntry } from '../../domain/diagramLabHistory.ts';
import { EvaluationCampaigns } from './EvaluationCampaigns.tsx';

const observation = (caseId: string, score: number | null): BiologyRadarObservation => ({
  id: caseId, campaignId: 'campaign-1', profileId: 'gemma', profile: 'Gemma e4b',
  model: 'gemma4:e4b', provider: 'ollama', method: 'generative',
  protocol: 'contract', caseId, recordedAt: '2026-11-12T10:00:00Z',
  status: 'success', score, referenceScore: 0, decisions: [],
});

function render(biology: BiologyRadarObservation[]) {
  return renderToStaticMarkup(
    <EvaluationCampaigns diagrams={[]} biology={biology} records={[]}
      filter={{ domain: 'biology' }} onDiagram={() => undefined} onCustom={() => undefined} />,
  );
}

describe('campaign result status and support actions', () => {
  it('does not call a campaign complete when successful calls returned no grades', () => {
    const html = render([observation('F', null), observation('G', 0)]);
    expect(html).toContain('Résultats partiels');
    expect(html).toContain('1/2 notes exploitables');
    expect(html).toContain('Partager le diagnostic');
    expect(html).toContain('>0/10<'); // a real zero remains a valid grade
    expect(html).toContain('>—/10<');
  });

  it('recognizes zero as a valid grade and does not show an error action for complete campaigns', () => {
    const html = render([observation('G', 0)]);
    expect(html).toContain('Terminée');
    expect(html).toContain('1/1 notes exploitables');
    expect(html).not.toContain('Partager le diagnostic');
  });

  it('presents a unified history with a selected report and filters', () => {
    const html = render([observation('G', 0)]);
    expect(html).toContain('Historique des évaluations');
    expect(html).toContain('Campagnes enregistrées');
    expect(html).toContain('Notes par copie');
    expect(html).toContain('aria-pressed="true"');
  });

  it('never offers an error report for a campaign still running', () => {
    const entry = {
      id: 'diagram-run', protocol: 'reference', createdAt: '2026-11-12T10:00:00Z',
      title: 'Batterie graphique', state: 'running', experimentCount: 3, successfulCount: 1,
      report: { format: 'companion-scientific-diagram-protocol', experiments: [] },
    } as unknown as DiagramLabArchiveEntry;
    const html = renderToStaticMarkup(<EvaluationCampaigns diagrams={[entry]} biology={[]}
      records={[]} filter={{ domain: 'diagrams' }} onDiagram={() => undefined}
      onCustom={() => undefined} />);
    expect(html).toContain('En cours');
    expect(html).not.toContain('Partager le diagnostic');
  });

  it('does not mark an empty archived test as successful', () => {
    const entry = {
      id: 'empty-diagram', protocol: 'reference', createdAt: '2026-11-12T10:00:00Z',
      title: 'Batterie graphique', state: 'finished', experimentCount: 0, successfulCount: 0,
      report: { format: 'companion-scientific-diagram-protocol', experiments: [] },
    } as unknown as DiagramLabArchiveEntry;
    const html = renderToStaticMarkup(<EvaluationCampaigns diagrams={[entry]} biology={[]}
      records={[]} filter={{ domain: 'diagrams' }} onDiagram={() => undefined}
      onCustom={() => undefined} />);
    expect(html).toContain('Incomplète');
    expect(html).toContain('Partager le diagnostic');
  });
});
