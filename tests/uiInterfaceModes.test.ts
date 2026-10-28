// @ts-expect-error Node built-in used by Vitest source-contract tests; browser app typings omit @types/node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('teacher and AI diagnostic interface modes', () => {
  const app = () => source('../src/ui/App.tsx');

  it('defaults to the teacher correction view', () => {
    expect(app()).toContain("useState<'teacher' | 'diagnostic'>('teacher')");
    expect(app()).toContain("interfaceMode === 'teacher' ? 'view-switch-button active' : 'view-switch-button'");
  });

  it('exposes an accessible switch whose buttons reflect the selected mode', () => {
    const text = app();
    expect(text).toContain('role="group" aria-label="Mode d’interface"');
    expect(text).toContain("aria-pressed={interfaceMode === 'teacher'}");
    expect(text).toContain("aria-pressed={interfaceMode === 'diagnostic'}");
    expect(text).toContain("onClick={() => setInterfaceMode('teacher')}");
    expect(text).toContain("onClick={() => setInterfaceMode('diagnostic')}");
  });

  it('keeps detailed Ollama configuration in diagnostic mode and offers an explicit entry point from teacher mode', () => {
    const text = app();
    expect(text).toContain("{interfaceMode === 'diagnostic' ? <article className=\\\"panel ollama-panel\\\">");
    expect(text).toContain("</article> : <article className=\\\"panel ai-summary-panel\\\">");
    expect(text).toContain("onClick={() => setInterfaceMode('diagnostic')}");
    expect(text).toContain('Tester la connexion et lister les modèles');
  });

  it('only displays raw streaming output in diagnostic mode', () => {
    expect(app()).toContain("{interfaceMode === 'diagnostic' && streamedOutput && <div className=\\\"streaming-preview\\\"");
  });

  it('changes the welcome copy to match the selected mode', () => {
    const text = app();
    expect(text).toContain("interfaceMode === 'teacher' ? 'ESPACE ENSEIGNANT · BIOLOGIE' : 'ESPACE DE DIAGNOSTIC · IA LOCALE'");
    expect(text).toContain("interfaceMode === 'teacher' ? 'Importez les copies");
  });
});
