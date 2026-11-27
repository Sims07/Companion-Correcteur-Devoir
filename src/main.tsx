import './instrumentation.ts';
import { discoverCompatibleModels } from './shared/adapters/ai/compatibleModelDiscovery.ts';
import './pwa/registerServiceWorker.ts';
import { prepareQuestionContracts } from './correction/adapters/ai/contractPreparation.ts';
import { createEvaluationVisionService } from './evaluation/application/evaluationVisionService.ts';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './shell/ui/App.tsx';
import { LocalMemoryCompanion } from './correction/ui/LocalMemoryCompanion.tsx';
import { installLocalMemoryFetchBridge } from './correction/adapters/ai/localMemoryFetchBridge.ts';
import { probeVisualLogprobs } from './shared/adapters/ai/visualLogprobTransport.ts';
import type { VisualLogprobProbe } from './shared/ports/visualLogprobProbe.ts';
import { currentFetch } from './shared/adapters/ai/currentFetch.ts';
import { unloadPilotOllamaModels } from './evaluation/adapters/ai/pilotOllamaMemory.ts';
import { IndexedDbBackgroundCorrectionRepository, IndexedDbLocalCorrectionRepository } from './correction/adapters/storage/correctionRepository.ts';
import { IndexedDbModelEvaluationRepository } from './evaluation/adapters/storage/evaluationRepository.ts';
import { IndexedDbStorageDiagnosticsRepository } from './shared/adapters/storage/indexedDbStorageDiagnostics.ts';
import { IndexedDbDiagramLabArchiveRepository } from './evaluation/adapters/storage/diagramLabArchive.ts';
import { createStorageDiagnosticsService } from './shared/application/storageDiagnosticsService.ts';
import { createLocalCorrectionService } from './correction/application/localCorrectionService.ts';
import { createModelEvaluationService } from './evaluation/application/modelEvaluationService.ts';
import { createBackgroundCorrectionService } from './correction/application/backgroundCorrectionService.ts';
import { createCorrectionWorkspaceService } from './correction/application/correctionWorkspaceService.ts';
import { createScientificDiagramAnalysisService } from './correction/application/scientificDiagramAnalysisService.ts';
import { createOpenAiScientificDiagramAnalyzer } from './correction/adapters/ai/openAiScientificDiagramAnalyzer.ts';
import { generateCopyAnnotations } from './correction/adapters/ai/generateCopyAnnotations.ts';
import { checkOllamaReady, createOllamaProvider, importRubricImageWithOllama, listOllamaModels, prewarmOllamaModel, unloadOllamaModel } from './correction/adapters/ai/ollamaProvider.ts';
import { detectOllamaDiagramThinkSetting } from './evaluation/adapters/ai/ollamaThinkingCapabilities.ts';
import { extractBlindVisualGraph } from './evaluation/adapters/ai/blindDiagramGraphClient.ts';
import { extractVisualRelationGraphV2 } from './evaluation/adapters/ai/relationGraphV2Client.ts';
import { eraseTeacherAnnotationColor, prepareLocalFiles, rotateLocalImage } from './correction/adapters/files/localFiles.ts';
import { importRubricFile } from './correction/adapters/files/rubricImport.ts';
import './shared/ui/styles.css';
import './correction/ui/correctionFlow.css';
import './correction/ui/annotationInk.css';
import './shared/ui/modelSelect.css';
import './shared/ui/observability.css';
import './shared/ui/design-system/tokens.css';
import './shared/ui/design-system/controls.css';
import './shared/ui/design-system/application-theme.css';
import './correction/ui/teacherAtelier.css';
import './correction/ui/correctionAtelier.css';
import './correction/ui/atelierBLayout.css';
import './correction/ui/atelierBRubric.css';
import './shared/ui/aiToolsAtelier.css';
import './evaluation/ui/modelEvaluationWorkspace.css';
import './correction/ui/atelierBProcessing.css';

const localCorrectionRepository = new IndexedDbLocalCorrectionRepository();
const localCorrectionService = createLocalCorrectionService(localCorrectionRepository);
const modelEvaluationService = createModelEvaluationService(new IndexedDbModelEvaluationRepository());
const diagramLabArchive = new IndexedDbDiagramLabArchiveRepository();
const storageDiagnosticsService = createStorageDiagnosticsService(new IndexedDbStorageDiagnosticsRepository());
const scientificDiagramAnalyzer = createOpenAiScientificDiagramAnalyzer();
const scientificDiagramAnalysisService = createScientificDiagramAnalysisService(scientificDiagramAnalyzer);
const correctionLogprobProbe: VisualLogprobProbe = (settings, images, target, context, signal) =>
  probeVisualLogprobs(settings, images, target, context, signal, currentFetch, 'Correction hybride · décision visuelle logprobs');
const backgroundCorrectionService = createBackgroundCorrectionService(new IndexedDbBackgroundCorrectionRepository(), { probeVisualLogprobs: correctionLogprobProbe, checkReady: (settings, signal) => checkOllamaReady(settings, currentFetch, signal), prewarmModel: (settings, model, signal) => prewarmOllamaModel(settings, model, currentFetch, signal), unloadModel: unloadOllamaModel, listModels: (endpoint, signal) => listOllamaModels(endpoint, currentFetch, signal), createProvider: createOllamaProvider, importRubricImage: (images, settings, onProgress, signal) => importRubricImageWithOllama(images, settings, currentFetch, onProgress, signal) }, scientificDiagramAnalysisService);
installLocalMemoryFetchBridge(localCorrectionRepository);
const correctionWorkspaceService = createCorrectionWorkspaceService(
  { probeVisualLogprobs: correctionLogprobProbe, generateCopyAnnotations, prepareQuestionContracts, discoverCompatibleModels: (endpoint, token, signal) => discoverCompatibleModels(endpoint, token, currentFetch, signal), checkReady: (settings, signal) => checkOllamaReady(settings, currentFetch, signal), prewarmModel: (settings, model, signal) => prewarmOllamaModel(settings, model, currentFetch, signal), listModels: (endpoint, signal) => listOllamaModels(endpoint, currentFetch, signal), createProvider: createOllamaProvider, importRubricImage: (images, settings, onProgress, signal) => importRubricImageWithOllama(images, settings, currentFetch, onProgress, signal) },
  {
    exportCopyAnnotationPdf: async (copy) => (await import('./correction/adapters/files/copyAnnotationPdf.ts')).createCopyAnnotationPdf(copy),
    prepareFiles: prepareLocalFiles, rotateImage: rotateLocalImage, eraseTeacherAnnotationColor, importRubric: importRubricFile },
);

const evaluationVision = createEvaluationVisionService({
  detectDiagramThinking: (endpoint, model, requireOff) => detectOllamaDiagramThinkSetting(endpoint, model, currentFetch, requireOff),
  extractBlindDiagramGraph: (endpoint, model, image, signal, onDiagnostic, provider, zoomUncertainArrows) => extractBlindVisualGraph({ endpoint, model, image, signal, onDiagnostic, ...provider, zoomUncertainArrows }),
  extractBlindDiagramGraphV2: (endpoint, model, image, signal, provider) => extractVisualRelationGraphV2({endpoint,model,image,signal,...provider}),
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App evaluationVision={evaluationVision} service={correctionWorkspaceService} archiveService={localCorrectionService} evaluationService={modelEvaluationService} diagramLabArchive={diagramLabArchive} storageDiagnosticsService={storageDiagnosticsService} backgroundCorrectionService={backgroundCorrectionService} diagramAnalysisService={scientificDiagramAnalysisService} releasePilotModels={unloadPilotOllamaModels} />
    <LocalMemoryCompanion service={localCorrectionService} />
  </React.StrictMode>,
);
