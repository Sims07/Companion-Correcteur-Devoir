import './instrumentation.ts';
import { prepareQuestionContracts } from './adapters/ai/contractPreparation.ts';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import { LocalMemoryCompanion } from './ui/LocalMemoryCompanion.tsx';
import { installLocalMemoryFetchBridge } from './adapters/ai/localMemoryFetchBridge.ts';
import { currentFetch } from './adapters/ai/currentFetch.ts';
import { loadOnDemandModel } from './adapters/ai/modelLoadClient.ts';
import { unloadPilotOllamaModels } from './adapters/ai/pilotOllamaMemory.ts';
import { IndexedDbBackgroundCorrectionRepository, IndexedDbLocalCorrectionRepository, IndexedDbModelEvaluationRepository } from './adapters/storage/indexedDbMemory.ts';
import { IndexedDbStorageDiagnosticsRepository } from './adapters/storage/indexedDbStorageDiagnostics.ts';
import { createStorageDiagnosticsService } from './application/storageDiagnosticsService.ts';
import { createLocalCorrectionService } from './application/localCorrectionService.ts';
import { createModelEvaluationService } from './application/modelEvaluationService.ts';
import { createBackgroundCorrectionService } from './application/backgroundCorrectionService.ts';
import { createCorrectionWorkspaceService } from './application/correctionWorkspaceService.ts';
import { createScientificDiagramAnalysisService } from './application/scientificDiagramAnalysisService.ts';
import { createOpenAiScientificDiagramAnalyzer } from './adapters/ai/openAiScientificDiagramAnalyzer.ts';
import { checkOllamaReady, createOllamaProvider, importRubricImageWithOllama, listOllamaModels, prewarmOllamaModel, unloadOllamaModel } from './adapters/ai/ollamaProvider.ts';
import { detectOllamaDiagramThinkSetting } from './adapters/ai/ollamaThinkingCapabilities.ts';
import { extractBlindVisualGraph } from './adapters/ai/blindDiagramGraphClient.ts';
import { eraseTeacherAnnotationColor, prepareLocalFiles, rotateLocalImage } from './adapters/files/localFiles.ts';
import { importRubricFile } from './adapters/files/rubricImport.ts';
import './ui/styles.css';
import './ui/correctionFlow.css';
import './ui/annotationInk.css';
import './ui/modelSelect.css';
import './ui/observability.css';
import './ui/design-system/tokens.css';
import './ui/design-system/controls.css';
import './ui/design-system/application-theme.css';
import './ui/teacherAtelier.css';
import './ui/correctionAtelier.css';
import './ui/atelierBLayout.css';
import './ui/atelierBRubric.css';
import './ui/aiToolsAtelier.css';
import './ui/modelEvaluationWorkspace.css';
import './ui/atelierBProcessing.css';

const localCorrectionRepository = new IndexedDbLocalCorrectionRepository();
const localCorrectionService = createLocalCorrectionService(localCorrectionRepository);
const modelEvaluationService = createModelEvaluationService(new IndexedDbModelEvaluationRepository());
const storageDiagnosticsService = createStorageDiagnosticsService(new IndexedDbStorageDiagnosticsRepository());
const scientificDiagramAnalyzer = createOpenAiScientificDiagramAnalyzer();
const scientificDiagramAnalysisService = createScientificDiagramAnalysisService(scientificDiagramAnalyzer);
const backgroundCorrectionService = createBackgroundCorrectionService(new IndexedDbBackgroundCorrectionRepository(), { checkReady: checkOllamaReady, prewarmModel: (settings, model, signal) => prewarmOllamaModel(settings, model, currentFetch, signal), unloadModel: unloadOllamaModel, listModels: listOllamaModels, createProvider: createOllamaProvider, importRubricImage: (images, settings, onProgress, signal) => importRubricImageWithOllama(images, settings, currentFetch, onProgress, signal) }, scientificDiagramAnalysisService);
installLocalMemoryFetchBridge(localCorrectionRepository);
const correctionWorkspaceService = createCorrectionWorkspaceService(
  { prepareQuestionContracts, checkReady: checkOllamaReady, detectDiagramThinking: (endpoint, model, requireOff) => detectOllamaDiagramThinkSetting(endpoint, model, currentFetch, requireOff), extractBlindDiagramGraph: (endpoint, model, image, signal, onDiagnostic, provider) => extractBlindVisualGraph({ endpoint, model, image, signal, onDiagnostic, ...provider }), prewarmModel: (settings, model, signal) => prewarmOllamaModel(settings, model, currentFetch, signal), listModels: listOllamaModels, createProvider: createOllamaProvider, importRubricImage: (images, settings, onProgress, signal) => importRubricImageWithOllama(images, settings, currentFetch, onProgress, signal) },
  { prepareFiles: prepareLocalFiles, rotateImage: rotateLocalImage, eraseTeacherAnnotationColor, importRubric: importRubricFile },
);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App service={correctionWorkspaceService} archiveService={localCorrectionService} evaluationService={modelEvaluationService} storageDiagnosticsService={storageDiagnosticsService} backgroundCorrectionService={backgroundCorrectionService} diagramAnalysisService={scientificDiagramAnalysisService} loadOnDemandModel={loadOnDemandModel} releasePilotModels={unloadPilotOllamaModels} />
    <LocalMemoryCompanion service={localCorrectionService} />
  </React.StrictMode>,
);
