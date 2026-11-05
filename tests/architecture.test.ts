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
      '../src/domain/rubricImport.ts',
      '../src/domain/observability.ts',
      '../src/domain/teacherAnnotations.ts',
      '../src/domain/backgroundCorrection.ts',
      '../src/domain/imageInput.ts',
      '../src/domain/scientificDiagram.ts',
      '../src/domain/scientificPageClassification.ts',
    ];
    for (const file of files) {
      const text = source(file);
      expect(imports(text).some((path) => /(^|\/)(ui|adapters|ports|application)\//.test(path)), file).toBe(false);
      expect(text, file).not.toMatch(/\b(window|document|indexedDB|IDBDatabase)\b/);
    }
  });

  it('keeps application use cases dependent only on domain and ports', () => {
    for (const file of ['../src/application/localCorrectionService.ts', '../src/application/correctionWorkspaceService.ts', '../src/application/modelEvaluationService.ts', '../src/application/scientificDiagramAnalysisService.ts', '../src/application/backgroundCorrectionService.ts']) {
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
      '../src/adapters/ai/openAiScientificDiagramAnalyzer.ts',
    ]) {
      expect(imports(source(file)).some((path) => /(^|\/)ui\//.test(path)), file).toBe(false);
      expect(imports(source(file)).some((path) => /(^|\/)application\//.test(path)), file).toBe(false);
    }
  });

  it('exposes image-based rubric extraction through the Ollama port rather than UI adapter imports', () => {
    const port = source('../src/ports/correctionWorkspace.ts');
    expect(port).toContain('importRubricImage(images: ImageInput[], settings: OllamaSettings, onProgress?');
    expect(port).toContain('signal?: AbortSignal');
    const service = source('../src/application/correctionWorkspaceService.ts');
    expect(service).toContain('ollama.importRubricImage(images, settings, onProgress, signal)');
  });

  it('keeps the scientific diagram analysis port independent from adapters', () => {
    const port = source('../src/ports/scientificDiagramAnalysis.ts');
    expect(imports(port).some((path) => path.includes('/adapters/'))).toBe(false);
    expect(imports(source('../src/application/scientificDiagramAnalysisService.ts')).some((path) => path.includes('/adapters/'))).toBe(false);
  });

  it('resolves network fetch lazily and installs the inspector before application adapters are created', () => {
    const networkAdapters = [
      '../src/adapters/ai/openAiScientificDiagramAnalyzer.ts',
      '../src/adapters/ai/openAiCompatibleTransport.ts',
      '../src/adapters/ai/ollamaProvider.ts',
      '../src/adapters/ai/modelLoadClient.ts',
    ];
    for (const file of networkAdapters) {
      const text = source(file);
      expect(text, file).toContain('currentFetch');
      expect(text, file).not.toContain('fetchImpl: typeof fetch = fetch');
      expect(text, file).not.toContain('requestFetch: typeof fetch = fetch');
    }
    const entrypoint = source('../src/main.tsx');
    expect(entrypoint.startsWith("import './instrumentation.ts';")).toBe(true);
    expect(source('../src/instrumentation.ts')).toContain('installNetworkInspector();');
  });

  it('keeps readable intents on every grading network phase', () => {
    const ollama = source('../src/adapters/ai/ollamaProvider.ts');
    for (const intent of [
      'Vérifier la disponibilité du modèle', 'Précharger le modèle', 'Lire et transcrire une page de copie',
      'Analyser le critère', 'Arbitrer les désaccords entre modèles', 'Lire et transcrire une page du barème',
      'Structurer le barème transcrit',
    ]) expect(ollama).toContain(intent);
    const diagrams = source('../src/adapters/ai/openAiScientificDiagramAnalyzer.ts');
    expect(diagrams).toContain('Classer la page ${pageNumber} pour la détection des schémas');
    // The text-generation instructions now live in the dedicated prompt catalog.
    // Keep the network intent test separate from the prompt ownership test.
    expect(diagrams).toContain('Analyser les schémas scientifiques');
    const diagramPrompts = source('../src/adapters/ai/prompts/scientificDiagramPrompts.ts');
    expect(diagramPrompts).toContain('Analyser les schémas de la page ${pageNumber}');
    expect(diagramPrompts).toContain('Réparer la réponse d’analyse des schémas');
  });
  it('uses main as the composition root for concrete dependencies', () => {
    const text = source('../src/main.tsx');
    expect(text).toContain('new IndexedDbLocalCorrectionRepository()');
    expect(text).toContain('new IndexedDbModelEvaluationRepository()');
    expect(text).toContain('new IndexedDbBackgroundCorrectionRepository()');
    expect(text).toContain('createBackgroundCorrectionService');
    expect(text).toContain('backgroundCorrectionService={backgroundCorrectionService}');
    expect(text).toContain('createModelEvaluationService');
    expect(text).toContain('createLocalCorrectionService(localCorrectionRepository)');
    expect(text).toContain('service={localCorrectionService}');
    expect(text).toContain('service={correctionWorkspaceService}');
  });
});
