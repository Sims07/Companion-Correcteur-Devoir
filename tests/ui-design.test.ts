import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('../src/ui/styles.css', import.meta.url), 'utf8');
const correctionFlowStylesheet = readFileSync(new URL('../src/ui/correctionFlow.css', import.meta.url), 'utf8');
const memoryStylesheet = readFileSync(new URL('../src/ui/localMemory.css', import.meta.url), 'utf8');
const memoryComponent = readFileSync(new URL('../src/ui/LocalMemoryCompanion.tsx', import.meta.url), 'utf8');

describe('UI design system', () => {
  it('defines a shared spacing scale and reusable surface tokens', () => {
    expect(stylesheet).toContain('--space-1: 4px');
    expect(stylesheet).toContain('--space-8: 32px');
    expect(stylesheet).toContain('--surface-subtle: #f8faf7');
    expect(stylesheet).toContain('--text-secondary: #647467');
  });

  it('provides visible keyboard focus states for interactive controls', () => {
    expect(stylesheet).toContain('button:focus-visible');
    expect(stylesheet).toContain('input:focus-visible');
    expect(stylesheet).toContain('textarea:focus-visible');
    expect(stylesheet).toContain('outline: 3px solid');
  });

  it('adapts the layout for narrow mobile viewports', () => {
    expect(stylesheet).toContain('@media (max-width: 560px)');
    expect(stylesheet).toContain('@media (max-width: 380px)');
    expect(stylesheet).toContain('.view-switch-button { flex: 1;');
  });

  it('respects reduced-motion preferences', () => {
    expect(stylesheet).toContain('@media (prefers-reduced-motion: reduce)');
    expect(stylesheet).toContain('animation-duration: .01ms');
  });

  it('gives the correction workflow an explicit visual hierarchy and breathing room', () => {
    expect(correctionFlowStylesheet).toContain('.workspace-heading .eyebrow');
    expect(correctionFlowStylesheet).toContain('.correction-mode-panel,\n.subject-panel {\n  margin-bottom: var(--flow-space-4);');
    expect(correctionFlowStylesheet).toContain('.correction-mode-options {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: var(--flow-space-4);');
    expect(correctionFlowStylesheet).toContain('.setup-grid {\n  gap: var(--flow-space-5);');
    expect(correctionFlowStylesheet).toContain('.question-panel {\n  margin-top: var(--flow-space-5);');
  });

  it('turns correction-mode radios into distinct selectable cards', () => {
    expect(correctionFlowStylesheet).toContain('.correction-mode-option {');
    expect(correctionFlowStylesheet).toContain('.correction-mode-option.selected {');
    expect(correctionFlowStylesheet).toContain('.correction-mode-option input[type="radio"] {');
    expect(correctionFlowStylesheet).toContain('.correction-mode-option small {');
  });

  it('keeps the correction flow readable on mobile and with reduced motion', () => {
    expect(correctionFlowStylesheet).toContain('@media (max-width: 760px)');
    expect(correctionFlowStylesheet).toContain('@media (max-width: 430px)');
    expect(correctionFlowStylesheet).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('gives correction rules a clear hierarchy instead of a compact catch-all panel', () => {
    expect(memoryStylesheet).toContain('.memory-panel{position:fixed');
    expect(memoryStylesheet).toContain('width:min(560px');
    expect(memoryStylesheet).toContain('.memory-correction-select{height:48px');
    expect(memoryStylesheet).toContain('.memory-section{border-top:1px solid');
    expect(memoryStylesheet).toContain('.memory-step{display:grid');
    expect(memoryStylesheet).toContain('@media(max-width:600px)');
    expect(memoryComponent).toContain('Correction active');
    expect(memoryComponent).toContain('Barème utilisé');
    expect(memoryComponent).toContain('Décision à conserver');
    expect(memoryComponent).toContain('Réutiliser cette décision avec le barème');
    expect(memoryComponent).toContain('+ Nouvelle correction');
  });
});
