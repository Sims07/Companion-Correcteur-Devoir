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
});
