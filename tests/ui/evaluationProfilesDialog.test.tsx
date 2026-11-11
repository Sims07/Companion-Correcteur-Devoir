import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvaluationProfilesDialog } from '../../src/ui/components/EvaluationProfilesDialog.tsx';

const configuration = {
  endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
  visionModel: 'qwen3.5:4b', analysisModel: 'qwen3.5:4b', generativeModel: 'qwen3.5:4b',
  decisionModel: '', transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto' as const,
  transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none' as const,
  transcriptionFrequencyPenalty: 0, analysisThinking: false, criterionByCriterion: true,
  correctionMethod: 'generative' as const, secondAnalysisModel: '', arbitratorModel: '',
  diagnosticStrategy: 'single' as const,
};
const profiles = [1, 2, 3, 4].map((n) => ({
  id: 'profile-' + n, name: 'Profil ' + n, configuration, mode: 'single' as const, updatedAt: '2026-11-11T08:00:00.000Z',
}));
const noop = () => undefined;

function render(selectedIds: string[] = []) {
  return renderToStaticMarkup(<EvaluationProfilesDialog
    profiles={profiles} selectedIds={selectedIds} busy={false}
    onChange={noop} onCreate={noop} onEdit={noop} onManageDeletion={noop} onClose={noop}
  />);
}

describe('model configurations dialog', () => {
  it('presents one modal for choosing, finding, creating and editing models', () => {
    const html = render(['profile-1']);
    expect(html).toContain('<dialog');
    expect(html).toContain('Gérer les configurations IA');
    expect(html).toContain('Configurations à exécuter');
    expect(html).toContain('Rechercher une configuration');
    expect(html).toContain('+ Nouvelle configuration');
    expect(html).toContain('Supprimer des configurations');
    expect(html).toContain('Profil 1');
    expect(html).toContain('1 /');
    expect((html.match(/>Modifier</g) ?? []).length).toBe(4);
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(4);
  });

  it('disables unchecked models when 3 are already selected, not checked ones', () => {
    const html = render(['profile-1', 'profile-2', 'profile-3']);
    expect(html).toContain('Trois modèles sélectionnés');
    const selections = html.split('type="checkbox"');
    expect(selections).toHaveLength(5);
    // The fourth unchecked profile cannot be added before another is removed.
    expect(selections[4]).toMatch(/disabled/);
  });

  it('does not require a saved model to open the dialog and prepare the first configuration', () => {
    const html = renderToStaticMarkup(<EvaluationProfilesDialog
      profiles={[]} selectedIds={[]} busy={false}
      onChange={noop} onCreate={noop} onEdit={noop} onManageDeletion={noop} onClose={noop}
    />);
    expect(html).toContain('Aucune configuration enregistrée');
    expect(html).toContain('+ Nouvelle configuration');
  });
});
