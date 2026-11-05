import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Atelier B : invariants du poste de correction pendant l’analyse', () => {
  const app = read('src/ui/App.tsx');
  const css = read('src/ui/atelierBProcessing.css');

  it('uses one dedicated processing workspace rather than two stacked progress panels', () => {
    expect(app).toContain('<ActiveCopyProcessingWorkspace job={activeBackgroundJob}');
    expect(app).not.toContain('className="analysis-progress teacher-progress-card background-copy-progress"');
    expect(app).not.toContain('className="live-copy-preview panel background-copy-progress"');
    expect(app).toContain("activeBackgroundJob?.status !== 'processing'");
    expect(app).toContain("!(currentBackgroundJobId && activeBackgroundJob?.status === 'processing')");
  });

  it('keeps a balanced, large image and flat cards', () => {
    expect(css).toContain('grid-template-columns: minmax(0,1.06fr) minmax(0,1fr)');
    expect(css).toContain('height: clamp(340px, 59vh, 680px)');
    expect(css).toContain('.atelier-processing-columns .background-copy-activity');
    expect(css).toContain('border-radius: 3px');
    expect(css).toContain('border-radius: 0');
    expect(css).toContain('@media (max-width: 1040px)');
    expect(css).toContain('@media (max-width: 720px)');
  });

  it('loads Atelier B overrides after all older flows and in Storybook', () => {
    const main = read('src/main.tsx');
    const storybook = read('.storybook/preview.ts');
    expect(main.indexOf("import './ui/atelierBProcessing.css'")).toBeGreaterThan(main.indexOf("import './ui/atelierBRubric.css'"));
    expect(storybook).toContain("import '../src/ui/atelierBProcessing.css'");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
