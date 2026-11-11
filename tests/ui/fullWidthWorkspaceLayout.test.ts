import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const app = readFileSync('src/ui/App.tsx', 'utf8');
const teacherCss = readFileSync('src/ui/atelierBLayout.css', 'utf8');
const aiCss = readFileSync('src/ui/aiToolsAtelier.css', 'utf8');
const evaluationCss = readFileSync('src/ui/modelEvaluationWorkspace.css', 'utf8');

describe('full-width consistency between Correction, Évaluer and Suivi & diagnostic', () => {
  it('keeps all three destinations on a named shell without changing their navigation', () => {
    expect(app).toContain('app-shell teacher-flow-shell');
    expect(app).toContain('app-shell evaluation-workspace-shell ai-tools-view');
    expect(app).toContain("'app-shell ai-tools-view'");
    expect(app).toContain('>Correction</button>');
    expect(app).toContain('>Évaluer</button>');
    expect(app).toContain('>Suivi & diagnostic</button>');
  });

  it('removes the narrower AI canvas cap and uses the same edge-to-edge header and gutters', () => {
    expect(teacherCss).toMatch(/\.teacher-flow-shell,[\s\S]*?max-width:\s*none/);
    const shell = aiCss.split('.ai-tools-view.app-shell {')[1]?.split('}')[0] ?? '';
    expect(shell).toContain('width: 100%');
    expect(shell).toContain('max-width: none');
    expect(shell).toContain('padding: 0 var(--ai-tools-page-gutter) 36px');

    const header = aiCss.split('.ai-tools-view.app-shell > .topbar {')[1]?.split('}')[0] ?? '';
    expect(header).toContain('margin-inline: calc(-1 * var(--ai-tools-page-gutter))');
    expect(header).toContain('padding: 12px var(--ai-tools-page-gutter)');
    expect(header).toContain('min-height: 76px');

    // Earlier legacy limits may remain for compatibility, but this
    // higher-specificity full-width selector must override both.
    expect(evaluationCss).toContain('.evaluation-workspace-shell');
    expect(aiCss).toContain('@media (max-width: 720px)');
    expect(aiCss).toContain('--ai-tools-page-gutter: 16px');
  });
});
