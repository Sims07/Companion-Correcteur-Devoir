import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VisualLogprobPilotPanel } from '../../src/evaluation/ui/components/VisualLogprobPilotPanel.tsx';
import { defaultAiModelConfiguration, type AiModelProfile } from '../../src/shared/domain/aiModelProfiles.ts';

const profile: AiModelProfile = { id: 'generic', name: 'Autre modèle', mode: 'single', updatedAt: '',
  configuration: { ...defaultAiModelConfiguration, correctionMethod: 'generative', apiCompatible: true,
    endpoint: 'https://mac.local/v1/responses', analysisModel: 'any-vlm' } };
describe('visual logprob pilot UI', () => {
  it('offers a generic local model with D/E and A/B/C/D/E suites', () => {
    const html = renderToStaticMarkup(<VisualLogprobPilotPanel profiles={[profile]} busy={false}
      prepareCase={async () => []} onRunChange={() => {}} />);
    expect(html).toContain('any-vlm');
    expect(html).toContain('D/E');
    expect(html).toContain('A/B/C/D/E');
    expect(html).toContain('Tester les logprobs');
  });
  it('refuses public endpoints', () => {
    const html = renderToStaticMarkup(<VisualLogprobPilotPanel profiles={[{ ...profile,
      configuration: { ...profile.configuration, endpoint: 'https://example.com/v1/responses' } }]} busy={false}
      prepareCase={async () => []} onRunChange={() => {}} />);
    expect(html).toContain('Sélectionnez un profil génératif');
    expect(html).not.toContain('any-vlm');
  });
});
