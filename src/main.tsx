import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import { LocalMemoryCompanion } from './ui/LocalMemoryCompanion.tsx';
import { installLocalMemoryFetchBridge } from './adapters/ai/localMemoryFetchBridge.ts';
import { installNetworkInspector } from './adapters/network/networkInspector.ts';
import { loadSalukiModel } from './adapters/ai/modelLoadClient.ts';
import { IndexedDbBackgroundCorrectionRepository, IndexedDbLocalCorrectionRepository, IndexedDbModelEvaluationRepository } from './adapters/storage/indexedDbMemory.ts';
import { createLocalCorrectionService } from './application/localCorrectionService.ts';
import { createModelEvaluationService } from './application/modelEvaluationService.ts';
import { createBackgroundCorrectionService } from './application/backgroundCorrectionService.ts';
import { createCorrectionWorkspaceService } from './application/correctionWorkspaceService.ts';
import { createScientificDiagramAnalysisService } from './application/scientificDiagramAnalysisService.ts';
import { createOpenAiScientificDiagramAnalyzer } from './adapters/ai/openAiScientificDiagramAnalyzer.ts';
import { checkOllamaReady, createOllamaProvider, importRubricImageWithOllama, listOllamaModels, prewarmOllamaModel, unloadOllamaModel } from './adapters/ai/ollamaProvider.ts';
import { eraseTeacherAnnotationColor, prepareLocalFiles, rotateLocalImage } from './adapters/files/localFiles.ts';
import { importRubricFile } from './adapters/files/rubricImport.ts';
import './ui/styles.css';
import './ui/correctionFlow.css';
import './ui/annotationInk.css';
import './ui/modelSelect.css';
import './ui/observability.css';
import './ui/design-system/tokens.css';
import './ui/design-system/controls.css';

const localCorrectionRepository = new IndexedDbLocalCorrectionRepository();
const localCorrectionService = createLocalCorrectionService(localCorrectionRepository);
const modelEvaluationService = createModelEvaluationService(new IndexedDbModelEvaluationRepository());
const scientificDiagramAnalysisService = createScientificDiagramAnalysisService(createOpenAiScientificDiagramAnalyzer());
const backgroundCorrectionService = createBackgroundCorrectionService(new IndexedDbBackgroundCorrectionRepository(), { checkReady: checkOllamaReady, prewarmModel: prewarmOllamaModel, unloadModel: unloadOllamaModel, listModels: listOllamaModels, createProvider: createOllamaProvider, importRubricImage: (images, settings, onProgress, signal) => importRubricImageWithOllama(images, settings, fetch, onProgress, signal) }, scientificDiagramAnalysisService);
// Install the observer first so subsequent fetch wrappers delegate through it.
installNetworkInspector();
installLocalMemoryFetchBridge(localCorrectionRepository);
const correctionWorkspaceService = createCorrectionWorkspaceService(
  { checkReady: checkOllamaReady, prewarmModel: prewarmOllamaModel, listModels: listOllamaModels, createProvider: createOllamaProvider, importRubricImage: (images, settings, onProgress, signal) => importRubricImageWithOllama(images, settings, fetch, onProgress, signal) },
  { prepareFiles: prepareLocalFiles, rotateImage: rotateLocalImage, eraseTeacherAnnotationColor, importRubric: importRubricFile },
);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App service={correctionWorkspaceService} archiveService={localCorrectionService} evaluationService={modelEvaluationService} backgroundCorrectionService={backgroundCorrectionService} diagramAnalysisService={scientificDiagramAnalysisService} loadSalukiModel={loadSalukiModel} />
    <LocalMemoryCompanion service={localCorrectionService} />
  </React.StrictMode>,
);
