import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BiologyRadarObservation } from '../../domain/biologyTeacherRadar.ts';
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
    expect(html).toContain('modèle 0/10'); // a real zero remains a valid grade
    expect(html).toContain('modèle —/10');
  });

  it('recognizes zero as a valid grade and does not show an error action for complete campaigns', () => {
    const html = render([observation('G', 0)]);
    expect(html).toContain('Terminée');
    expect(html).toContain('1/1 notes exploitables');
    expect(html).not.toContain('Partager le diagnostic');
  });
});
