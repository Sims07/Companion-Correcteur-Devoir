import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('visual System One is limited to the technical model benchmark', () => {
  it('has an opt-in image mode with provenance and no copy OCR', () => {
    const app = readFileSync(new URL('../../src/ui/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('evaluation-visual-proof');
    expect(app).toContain('Tester la décision directement sur les images (D1 / D3)');
    expect(app).toContain('isVisualDecisionModel(profile.configuration.analysisModel)');
    expect(app).toContain('directVisualDecision: directProfiles(profile)');
    expect(app).toContain('directVisualDecision: output.configuration.directVisualDecision');
    expect(app).toContain("configuration.directVisualDecision ? ['analysis']");
  });

  it('keeps rubric-driven visual decisions distinguishable from provisional scores in results and history', () => {
    const app = readFileSync(new URL('../../src/ui/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('summarizeModelEvaluationScores(modelEvaluationResults, rubric)');
    expect(app).toContain('compareVisualDecisions(comparableResults, rubric)');
    expect(app).toContain('visualChoiceLabels[item.choice]');
    expect(app).toContain('Décisions System One par attendu du barème');
    expect(app).toContain('Décisions historiques reconstruites à partir des traces locales');
    expect(app).toContain("criterionResult?.assessmentStatus === 'not-evaluated' ? 'À arbitrer'");
    expect(app).toContain('complete.length > 1 && <details');
    expect(app).toContain('Note incomplète : certains attendus sont à arbitrer');
  });

  it('does not anchor the visual System One question factory on any specific school subject', () => {
    const source = readFileSync(new URL('../../src/domain/systemOneDecision.ts', import.meta.url), 'utf8');
    const visualFactory = source.slice(source.indexOf('function visualExpectedQuestion('), source.indexOf('function expectedQuestion('));
    expect(visualFactory).toContain('target.title');
    expect(visualFactory).toContain('target.description');
    expect(visualFactory).not.toMatch(/mitose|phragmoplaste|interphase|fourche de réplication|réactif\\/produit/i);
  });
});
