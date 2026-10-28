// @ts-expect-error Node built-in used only by Vitest architecture tests; browser app typings omit @types/node.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const imports = (text: string) => [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

describe('hexagonal architecture boundaries', () => {
  it('keeps the domain independent from UI, adapters, ports and browser APIs', () => {
    const files = [
      '../src/domain/grading.ts',
      '../src/domain/localCorrection.ts',
      '../src/domain/localMemory.ts',
      '../src/domain/localMemoryContext.ts',
      '../src/domain/rubric.ts',
    ];
    for (const file of files) {
      const text = source(file);
      expect(imports(text).some((path) => /(^|\/)(ui|adapters|ports|application)\//.test(path)), file).toBe(false);
      expect(text, file).not.toMatch(/\b(window|document|indexedDB|IDBDatabase)\b/);
    }
  });

  it('keeps application use cases dependent only on domain and ports', () => {
    for (const file of ['../src/application/localCorrectionService.ts', '../src/application/correctionWorkspaceService.ts']) {
      const text = source(file);
      expect(imports(text).every((path) => path.startsWith('../domain/') || path.startsWith('../ports/')), file).toBe(true);
      expect(text, file).not.toMatch(/\\b(window|document|indexedDB|React)\\b/);
    }
  });

  it('prevents UI components from importing concrete adapters', () => {
    for (const file of ['../src/ui/App.tsx', '../src/ui/LocalMemoryCompanion.tsx']) {
      expect(imports(source(file)).some((path) => path.includes('/adapters/')), file).toBe(false);
    }
  });

  it('keeps adapters independent from UI and application implementation', () => {
    for (const file of [
      '../src/adapters/storage/indexedDbMemory.ts',
      '../src/adapters/ai/localMemoryFetchBridge.ts',
    ]) {
      expect(imports(source(file)).some((path) => /(^|\/)ui\//.test(path)), file).toBe(false);
      expect(imports(source(file)).some((path) => /(^|\/)application\//.test(path)), file).toBe(false);
    }
  });

  it('exposes image-based rubric extraction through the Ollama port rather than UI adapter imports', () => {
    const port = source('../src/ports/correctionWorkspace.ts');
    expect(port).toContain('importRubricImage(image: ImageInput, settings: OllamaSettings)');
    const service = source('../src/application/correctionWorkspaceService.ts');
    expect(service).toContain('ollama.importRubricImage(image, settings)');
  });

  it('uses main as the composition root for concrete dependencies', () => {
    const text = source('../src/main.tsx');
    expect(text).toContain('new IndexedDbLocalCorrectionRepository()');
    expect(text).toContain('createLocalCorrectionService(localCorrectionRepository)');
    expect(text).toContain('service={localCorrectionService}');
    expect(text).toContain('service={correctionWorkspaceService}');
  });
});


describe('teacher and AI diagnostic interface modes', () => {
  const app = () => source('../src/ui/App.tsx');

  it('defaults to the teacher correction view', () => {
    expect(app()).toContain("useState<'teacher' | 'diagnostic'>('teacher')");
    expect(app()).toContain("interfaceMode === 'teacher' ? 'view-switch-button active' : 'view-switch-button'");
  });

  it('exposes an accessible switch whose buttons reflect the selected mode', () => {
    const text = app();
    expect(text).toContain('role="group" aria-label="Mode d’interface"');
    expect(text).toContain('aria-pressed={interfaceMode === \'teacher\'}');
    expect(text).toContain('aria-pressed={interfaceMode === \'diagnostic\'}');
    expect(text).toContain("onClick={() => setInterfaceMode('teacher')}");
    expect(text).toContain("onClick={() => setInterfaceMode('diagnostic')}");
  });

  it('keeps detailed Ollama configuration in diagnostic mode and offers an explicit entry point from teacher mode', () => {
    const text = app();
    expect(text).toContain("{interfaceMode === 'diagnostic' ? <article className=\"panel ollama-panel\">");
    expect(text).toContain("</article> : <article className=\"panel ai-summary-panel\">");
    expect(text).toContain("onClick={() => setInterfaceMode('diagnostic')}");
    expect(text).toContain('Tester la connexion et lister les modèles');
  });

  it('only displays raw streaming output in diagnostic mode', () => {
    expect(app()).toContain("{interfaceMode === 'diagnostic' && streamedOutput && <div className=\"streaming-preview\"");
  });

  it('changes the welcome copy to match the selected mode', () => {
    const text = app();
    expect(text).toContain("interfaceMode === 'teacher' ? 'ESPACE ENSEIGNANT · BIOLOGIE' : 'ESPACE DE DIAGNOSTIC · IA LOCALE'");
    expect(text).toContain("interfaceMode === 'teacher' ? 'Importez les copies");
  });
});
