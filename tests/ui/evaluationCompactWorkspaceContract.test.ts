import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('compact model evaluation setup', () => {
  const app = readFileSync('src/ui/App.tsx', 'utf8');
  const scientific = readFileSync('src/ui/components/ScientificDiagramProtocolPanel.tsx', 'utf8');
  const biology = readFileSync('src/ui/components/PilotEvaluationPanel.tsx', 'utf8');
  const styles = readFileSync('src/ui/modelEvaluationWorkspace.css', 'utf8');

  it('keeps selected profiles and the optional configuration editor together without deleting their actions', () => {
    expect(app).toContain('className="evaluation-setup-toolbar"');
    expect(app).toContain('className="evaluation-model-selector"');
    expect(app).toContain('className="evaluation-config-editor"');
    expect(app).toContain('Créer / modifier IA');
    expect(app).toContain('onClick={saveAiModelProfile}');
    expect(app).toContain('setManagingAiProfiles(true)');
    expect(styles).toContain('.evaluation-setup-toolbar > .evaluation-config-editor[open]');
  });

  it('keeps test methods and per-battery actions while removing redundant headings', () => {
    expect(scientific).toContain('className="evaluation-visually-hidden">Schémas scientifiques · batteries de tests');
    expect(scientific).not.toContain('LABORATOIRE · PROTOCOLES AUTOMATIQUES');
    expect(scientific).toContain('onClick={() => { void runPreparedFixtures(SCIENTIFIC_DIAGRAM_BASE_CASE_IDS); }}');
    expect(scientific).toContain('id="diagram-method-selection"');
    expect(scientific).toContain('onClick={onStop}');
    expect(biology).toContain('className="evaluation-visually-hidden">Tests de référence en biologie');
    expect(biology).toContain('onClick={onRunContracts}');
    expect(biology).toContain('onRunRepeatability(repeatabilityCount, repeatabilityMode)');
  });

  it('preserves a single responsive horizontal results menu without page-level overflow', () => {
    expect(styles).toContain('flex-wrap: nowrap;');
    expect(styles).toContain('overflow-x: auto;');
    expect(styles).toContain('max-width: 100%;');
  });
});
