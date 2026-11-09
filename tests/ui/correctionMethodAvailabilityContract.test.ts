import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('teacher correction strategy safeguard', () => {
  it('keeps generative mode visible and offers explicit decision selection after connecting the engine', () => {
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    const fields = readFileSync('src/ui/components/AiModelRoleFields.tsx', 'utf8');
    expect(app).toContain('<AiModelRoleFields prefix="ai"');
    expect(app).toContain('<AiModelRoleFields prefix="evaluation"');
    expect(fields).toContain('Correction générative');
    expect(fields).toContain('Correction décisionnelle');
    expect(app).toContain('correctionMethod, ...((interfaceMode');
    expect(app).toContain("profile.configuration.correctionMethod === 'decision' ? 'décisionnelle' : 'classique'");
  });
});
