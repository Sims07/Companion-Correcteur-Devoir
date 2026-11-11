import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('persistent evaluation activity deep links', () => {
  const app = readFileSync('src/ui/App.tsx', 'utf8');
  const scientific = readFileSync('src/ui/components/ScientificDiagramProtocolPanel.tsx', 'utf8');
  const biology = readFileSync('src/ui/components/PilotEvaluationPanel.tsx', 'utf8');

  it('keeps a compact in-page locator separate from the actual evaluation content', () => {
    expect(app).toContain('aria-label="Dernière expérience lancée"');
    expect(app).toContain('function showEvaluationActivity()');
    expect(app).toContain("setDiagramLabView('protocols')");
    expect(app).toContain('setEvaluationJumpTarget(');
    expect(app).toContain('setEvaluationActivity({ ...activity, status:');
  });

  it('connects each scientific protocol to an actual report or launch target', () => {
    for (const suffix of ['fixture', 'sensitivity', 'graph', 'personal']) {
      const id = 'evaluation-diagram-' + suffix + '-results';
      expect(app).toContain("targetId: '" + id + "'");
      expect(scientific).toContain('id="' + id + '"');
      expect(scientific).toContain('id="evaluation-diagram-' + suffix + '-launch"');
    }
  });

  it('connects every guided biology runner and the personal test', () => {
    for (const suffix of ['contract', 'repeatability', 'copy', 'cpu']) {
      const id = 'evaluation-biology-' + suffix + '-results';
      expect(app).toContain("targetId: '" + id + "'");
      expect(biology).toContain('id="' + id + '"');
      expect(biology).toContain('id="evaluation-biology-' + suffix + '-launch"');
    }
    expect(app).toContain("title: 'Évaluation libre · '");
    expect(app).toContain("journey: 'custom', targetId: 'evaluation-results'");
    expect(app).toContain('function cancelModelEvaluation()');
  });
});

describe('scientific diagram observability wiring', () => {
  it('sends all diagram runs and graph observations to local observability history', () => {
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).toContain('toDiagramLabObservabilityTraces(savedRecord');
    expect(app).toContain('toBlindGraphObservabilityTrace(run');
    expect(app).toContain('retainDiagramObservability(');
    expect(app).toContain('setTimingHistory((current)');
  });
});
