import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('teacher correction strategy safeguard', () => {
  it('keeps generative mode visible and offers explicit decision selection after connecting the engine', () => {
    const app = readFileSync('src/ui/App.tsx', 'utf8');
    expect(app).toContain('id="ai-correction-method"');
    expect(app).toContain('<option value="generative">Classique — vision et analyse</option>');
    expect(app).toContain('<option value="decision">');
    expect(app).toContain('correctionMethod, ...((interfaceMode');
  });
});
