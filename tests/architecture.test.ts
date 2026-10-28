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
    const text = source('../src/application/localCorrectionService.ts');
    expect(imports(text).every((path) => path.startsWith('../domain/') || path.startsWith('../ports/'))).toBe(true);
    expect(text).not.toMatch(/\b(window|document|indexedDB|React)\b/);
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

  it('uses main as the composition root for concrete dependencies', () => {
    const text = source('../src/main.tsx');
    expect(text).toContain('new IndexedDbLocalCorrectionRepository()');
    expect(text).toContain('createLocalCorrectionService(localCorrectionRepository)');
    expect(text).toContain('service={localCorrectionService}');
  });
});
