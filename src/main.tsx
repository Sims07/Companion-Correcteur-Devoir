import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import { LocalMemoryCompanion } from './ui/LocalMemoryCompanion.tsx';
import { installLocalMemoryFetchBridge } from './adapters/ai/localMemoryFetchBridge.ts';
import { loadSalukiModel } from './adapters/ai/modelLoadClient.ts';
import { IndexedDbLocalCorrectionRepository, IndexedDbModelEvaluationRepository } from './adapters/storage/indexedDbMemory.ts';
import { createLocalCorrectionService } from './application/localCorrectionService.ts';
import { createModelEvaluationService } from './application/modelEvaluationService.ts';
import { createCorrectionWorkspaceService } from './application/correctionWorkspaceService.ts';
import { checkOllamaReady, createOllamaProvider, importRubricImageWithOllama, listOllamaModels } from './adapters/ai/ollamaProvider.ts';
import { prepareLocalFiles } from './adapters/files/localFiles.ts';
import { importRubricFile } from './adapters/files/rubricImport.ts';
import './ui/styles.css';
import './ui/correctionFlow.css';
import './ui/modelSelect.css';
import './ui/observability.css';
import './ui/design-system/tokens.css';
import './ui/design-system/controls.css';

const localCorrectionRepository = new IndexedDbLocalCorrectionRepository();
const localCorrectionService = createLocalCorrectionService(localCorrectionRepository);
const modelEvaluationService = createModelEvaluationService(new IndexedDbModelEvaluationRepository());
installLocalMemoryFetchBridge(localCorrectionRepository);
const correctionWorkspaceService = createCorrectionWorkspaceService(
  { checkReady: checkOllamaReady, listModels: listOllamaModels, createProvider: createOllamaProvider, importRubricImage: (images, settings, onProgress, signal) => importRubricImageWithOllama(images, settings, fetch, onProgress, signal) },
  { prepareFiles: prepareLocalFiles, importRubric: importRubricFile },
);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App service={correctionWorkspaceService} archiveService={localCorrectionService} evaluationService={modelEvaluationService} loadSalukiModel={loadSalukiModel} />
    <LocalMemoryCompanion service={localCorrectionService} />
  </React.StrictMode>,
);
