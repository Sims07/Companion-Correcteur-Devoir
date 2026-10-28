import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import { LocalMemoryCompanion } from './ui/LocalMemoryCompanion.tsx';
import { installLocalMemoryFetchBridge } from './adapters/ai/localMemoryFetchBridge.ts';
import { IndexedDbLocalCorrectionRepository } from './adapters/storage/indexedDbMemory.ts';
import { createLocalCorrectionService } from './application/localCorrectionService.ts';
import './ui/styles.css';

const localCorrectionRepository = new IndexedDbLocalCorrectionRepository();
const localCorrectionService = createLocalCorrectionService(localCorrectionRepository);
installLocalMemoryFetchBridge(localCorrectionRepository);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <LocalMemoryCompanion service={localCorrectionService} />
  </React.StrictMode>,
);
